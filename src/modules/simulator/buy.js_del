

const CurveAMM = require('../../utils/curve_amm');
const { convertApiOrdersFormat, absoluteValue } = require('./utils');

/**
 * Simulate buy transaction analysis
 * @param {string} mint - Token address
 * @param {bigint|string|number} buySolAmount - SOL amount to buy (u64 format, precision 10^9)
 * @returns {Promise<Object>} Buy analysis result
 */
async function simulateBuy(mint, buySolAmount) {
    // Initialize return result
    const result = {
        success: false,
        errorCode: null,
        errorMessage: null,
        data: null
    };

    try {
        // Parameter validation
        if (!mint || typeof mint !== 'string') {
            result.errorCode = 'PARAM_ERROR';
            result.errorMessage = 'Invalid mint parameter';
            return result;
        }

        if (buySolAmount === undefined || buySolAmount === null || buySolAmount <= 0) {
            result.errorCode = 'PARAM_ERROR';
            result.errorMessage = 'Invalid buySolAmount parameter';
            return result;
        }

        // Convert buySolAmount to bigint
        const buyingSolAmountU64 = typeof buySolAmount === 'bigint' ? buySolAmount : BigInt(buySolAmount);

        // Get current price
        let currentPrice;
        try {
            const priceString = await this.sdk.data.price(mint);
            currentPrice = BigInt(priceString);
            
        } catch (error) {
            result.errorCode = 'API_ERROR';
            result.errorMessage = `Failed to get token info: ${error.message}`;
            return result;
        }

        // Get short order list
        let shortOrderList;
        try {
            const ordersData = await this.sdk.data.orders(mint, { type: 'up_orders' });
            if (!ordersData.success || !ordersData.data || !ordersData.data.orders) {
                result.errorCode = 'API_ERROR';
                result.errorMessage = 'Unable to get order info';
                return result;
            }
            shortOrderList = convertApiOrdersFormat(ordersData.data.orders);
        } catch (error) {
            result.errorCode = 'API_ERROR';
            result.errorMessage = `Failed to get order info: ${error.message}`;
            return result;
        }

        // Handle empty order list
        if (shortOrderList.length === 0) {
            shortOrderList.push(null);
        }

        // Calculate ideal token amount without slippage
        const idealTradeResult = CurveAMM.buyFromPriceWithSolInput(currentPrice, buyingSolAmountU64);
        const idealTokenAmount = idealTradeResult ? idealTradeResult[1] : 0n;
        const idealSolAmount = buyingSolAmountU64;

        // Initialize price range and liquidity variables
        let maxAllowedPrice = 0n;
        let totalPriceSpan = 0n;
        let transactionCompletionRate = 0.0;
        let totalLiquiditySolAmount = 0n;
        let totalLiquidityTokenAmount = 0n;
        let targetReachedAtSegmentIndex = -1;

        // Build price segment analysis list
        const priceSegmentAnalysisList = new Array(shortOrderList.length);

        // Iterate through order list and calculate parameters for each price segment
        for (let segmentIndex = 0; segmentIndex < shortOrderList.length; segmentIndex++) {
            let segmentStartPrice, segmentEndPrice;

            // Determine start and end prices based on segment position
            if (segmentIndex === 0) {
                // First segment: start from current price
                segmentStartPrice = currentPrice;

                if (shortOrderList[0] === null) {
                    // If first order is null, no orders exist
                    segmentEndPrice = CurveAMM.MAX_U128_PRICE;
                    maxAllowedPrice = CurveAMM.MAX_U128_PRICE;
                } else {
                    // To one unit before first order start price
                    segmentEndPrice = BigInt(shortOrderList[0].lockLpStartPrice);
                    maxAllowedPrice = BigInt(shortOrderList[0].lockLpStartPrice);
                }
            } else if (shortOrderList[segmentIndex] === null) {
                // Current iteration reaches null (end of list)
                segmentStartPrice = BigInt(shortOrderList[segmentIndex - 1].lockLpEndPrice);
                segmentEndPrice = CurveAMM.MAX_U128_PRICE;
            } else {
                // Normal case: gap between two orders
                segmentStartPrice = BigInt(shortOrderList[segmentIndex - 1].lockLpEndPrice);
                segmentEndPrice = BigInt(shortOrderList[segmentIndex].lockLpStartPrice);
            }

            // Validate price segment validity
            if (segmentStartPrice > segmentEndPrice) {
                // Invalid price segment, skip
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    requiredSolAmount: null,
                    obtainableTokenAmount: null,
                    isValid: false
                };
                continue;
            }

            if (segmentStartPrice == segmentEndPrice) {
                // Price segments are equal
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    requiredSolAmount: 0n,
                    obtainableTokenAmount: 0n,
                    isValid: true
                };
                continue;
            }

            // Use AMM to calculate transaction parameters for this segment
            const segmentTradeResult = CurveAMM.buyFromPriceToPrice(segmentStartPrice, segmentEndPrice);

            if (!segmentTradeResult) {
                // AMM calculation failed
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    requiredSolAmount: null,
                    obtainableTokenAmount: null,
                    isValid: false
                };
            } else {
                // Calculation successful, save result
                const [requiredSolAmount, obtainableTokenAmount] = segmentTradeResult;
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    requiredSolAmount,
                    obtainableTokenAmount,
                    isValid: true
                };
            }
        }

        // Accumulate total liquidity depth
        for (let i = 0; i < priceSegmentAnalysisList.length; i++) {
            const segment = priceSegmentAnalysisList[i];

            if (segment.isValid && segment.requiredSolAmount !== null && segment.obtainableTokenAmount !== null) {
                totalLiquiditySolAmount += BigInt(segment.requiredSolAmount);
                totalLiquidityTokenAmount += BigInt(segment.obtainableTokenAmount);

                // Check if accumulated token amount has reached ideal target
                if (totalLiquidityTokenAmount >= idealTokenAmount && targetReachedAtSegmentIndex === -1) {
                    targetReachedAtSegmentIndex = i;
                }
            }
        }

        // Calculate actual transaction parameters
        let actualRequiredSolAmount = 0n;
        let actualObtainableTokenAmount = 0n;

        if (targetReachedAtSegmentIndex !== -1) {
            // Can complete 100% of transaction
            transactionCompletionRate = 100.0;

            for (let i = 0; i <= targetReachedAtSegmentIndex; i++) {
                const currentSegment = priceSegmentAnalysisList[i];

                if (i === targetReachedAtSegmentIndex) {
                    // Last segment: may only need partial transaction
                    const remainingTokenNeeded = idealTokenAmount - actualObtainableTokenAmount;
                    const partialTradeResult = CurveAMM.buyFromPriceWithTokenOutput(
                        currentSegment.startPrice,
                        remainingTokenNeeded
                    );

                    if (partialTradeResult) {
                        const [finalPrice, requiredSolForPartial] = partialTradeResult;
                        actualRequiredSolAmount += requiredSolForPartial;
                        actualObtainableTokenAmount += remainingTokenNeeded;
                        totalPriceSpan += absoluteValue(currentSegment.startPrice - finalPrice) + 1n;
                    }
                } else {
                    // Use this segment completely
                    actualRequiredSolAmount += currentSegment.requiredSolAmount;
                    actualObtainableTokenAmount += currentSegment.obtainableTokenAmount;
                    totalPriceSpan += absoluteValue(currentSegment.startPrice - currentSegment.endPrice) + 1n;
                }
            }
        } else {
            // Cannot complete transaction fully, use all available liquidity
            for (let i = 0; i < priceSegmentAnalysisList.length; i++) {
                const segment = priceSegmentAnalysisList[i];
                if (segment.isValid) {
                    actualRequiredSolAmount += segment.requiredSolAmount;
                    actualObtainableTokenAmount += segment.obtainableTokenAmount;
                    totalPriceSpan += absoluteValue(segment.startPrice - segment.endPrice) + 1n;
                }
            }

            // Calculate transaction completion rate
            if (idealTokenAmount > 0n) {
                transactionCompletionRate = parseFloat(
                    CurveAMM.u64ToTokenDecimal(actualObtainableTokenAmount)
                        .div(CurveAMM.u64ToTokenDecimal(idealTokenAmount))
                        .mul(100)
                        .toFixed(2)
                );
            }

            // Recalculate theoretical SOL needed (based on actual obtainable token amount)
            const theoreticalTradeResult = CurveAMM.buyFromPriceWithTokenOutput(currentPrice, actualObtainableTokenAmount);
            if (theoreticalTradeResult) {
                const [, theoreticalSolNeeded] = theoreticalTradeResult;
                buyingSolAmountU64 = theoreticalSolNeeded;
            }
        }

        // Calculate minimum slippage percentage
        const minimumSlippagePercentage = Math.abs(
            100.0 * (
                CurveAMM.u64ToSolDecimal(buyingSolAmountU64)
                    .minus(CurveAMM.u64ToSolDecimal(actualRequiredSolAmount))
                    .div(CurveAMM.u64ToSolDecimal(buyingSolAmountU64))
                    .toNumber()
            )
        );

        // Set successful result
        result.success = true;
        result.data = {
            inputType: 'sol',                                    // Input currency type
            inputAmount: buyingSolAmountU64,                    // Input amount
            maxAllowedPrice: maxAllowedPrice,                   // Maximum allowed start price
            totalPriceSpan: totalPriceSpan,                     // Transaction price range
            transactionCompletionRate: transactionCompletionRate, // Theoretical transaction completion percentage
            idealTokenAmount: idealTokenAmount,                 // Ideal token amount obtainable
            idealSolAmount: idealSolAmount,                     // Ideal SOL amount needed
            actualRequiredSolAmount: actualRequiredSolAmount,   // Actual SOL amount required
            actualObtainableTokenAmount: actualObtainableTokenAmount, // Actual token amount obtainable
            theoreticalSolAmount: buyingSolAmountU64,           // SOL needed under liquidity pool constraints, no slippage
            minimumSlippagePercentage: minimumSlippagePercentage, // Minimum slippage percentage
            totalLiquiditySolAmount: totalLiquiditySolAmount,   // Total liquidity depth SOL
            totalLiquidityTokenAmount: totalLiquidityTokenAmount // Total liquidity depth Token
        };

    } catch (error) {
        // Catch unexpected errors
        result.errorCode = 'DATA_ERROR';
        result.errorMessage = `Error occurred during calculation: ${error.message}`;
    }

    return result;
}


/**
 * Simulate token buy transaction - calculate if target token amount can be purchased
 * 模拟以 Token 数量为目标的买入交易 - 计算是否能买到指定数量的 Token
 * @param {string} mint - Token address 代币地址
 * @param {bigint|string|number} buyTokenAmount - Target token amount to buy 目标购买的 Token 数量
 * @param {string} passOrder - Optional order address to skip (won't be liquidated) 可选的跳过订单地址
 * @returns {Promise<Object>} Token buy simulation result 模拟结果
 */
async function simulateTokenBuy(mint, buyTokenAmount, passOrder = null) {
    // 初始化返回结果 Initialize return result
    const result = {
        success: false,
        errorCode: null,
        errorMessage: null,
        data: null
    };

    try {
        // 参数验证 Parameter validation
        if (!mint || typeof mint !== 'string') {
            result.errorCode = 'INVALID_MINT';
            result.errorMessage = 'Invalid mint address';
            return result;
        }

        // 转换并验证 token 数量 Convert and validate token amount
        const targetTokenAmount = typeof buyTokenAmount === 'bigint' ? 
            buyTokenAmount : BigInt(buyTokenAmount);
            
        if (targetTokenAmount <= 0n) {
            result.errorCode = 'INVALID_AMOUNT';
            result.errorMessage = 'Token amount must be positive';
            return result;
        }

        // 验证 passOrder 参数 Validate passOrder parameter
        if (passOrder !== null && typeof passOrder !== 'string') {
            result.errorCode = 'INVALID_PASS_ORDER';
            result.errorMessage = 'Pass order must be a valid address string';
            return result;
        }

        // 获取当前价格 Get current price
        let currentPrice;
        try {
            const priceString = await this.sdk.data.price(mint);
            currentPrice = BigInt(priceString);
        } catch (error) {
            result.errorCode = 'API_ERROR';
            result.errorMessage = `Failed to get price: ${error.message}`;
            return result;
        }

        // 获取做空订单列表（限制为 MAX_ORDERS_COUNT + 1）
        // Get short order list (limited to MAX_ORDERS_COUNT + 1)
        let orders;
        try {
            const ordersData = await this.sdk.data.orders(mint, {
                type: 'up_orders',
                limit: this.sdk.MAX_ORDERS_COUNT + 1
            });
            
            if (!ordersData.success || !ordersData.data || !ordersData.data.orders) {
                result.errorCode = 'API_ERROR';
                result.errorMessage = 'Unable to get order info';
                return result;
            }
            
            // 转换订单格式 Convert order format
            orders = ordersData.data.orders;
        } catch (error) {
            result.errorCode = 'API_ERROR';
            result.errorMessage = `Failed to get orders: ${error.message}`;
            return result;
        }

        // 场景 A: 无订单，直接计算
        // Scenario A: No orders, direct calculation
        if (orders.length === 0) {
            const calcResult = CurveAMM.buyFromPriceWithTokenOutput(currentPrice, targetTokenAmount);
            if (calcResult) {
                const [finalPrice, requiredSol] = calcResult;
                
                result.success = true;
                result.data = {
                    inputType: 'token',
                    inputAmount: targetTokenAmount,
                    currentPrice: currentPrice,
                    canComplete: true,
                    completionRate: 100.0,
                    limitReason: null,
                    idealSolRequired: requiredSol,
                    idealEndPrice: finalPrice,
                    actualObtainableToken: targetTokenAmount,
                    actualRequiredSol: requiredSol,
                    actualEndPrice: finalPrice,
                    ordersToClose: [],
                    ordersToCloseCount: 0,
                    passOrderIndex: null,
                    hasMoreOrders: false,
                    totalAvailableToken: CurveAMM.MAX_U64,
                    totalAvailableSol: CurveAMM.MAX_U64,
                    priceImpact: Number((finalPrice - currentPrice) * 10000n / currentPrice) / 100,
                    maxReachablePrice: CurveAMM.MAX_U128_PRICE,
                    segments: []
                };
                return result;
            } else {
                result.errorCode = 'CURVE_ERROR';
                result.errorMessage = 'Failed to calculate buy amounts';
                return result;
            }
        }

        // 初始化变量 Initialize variables
        let totalAvailableToken = 0n;  // 累积可购买的 token
        let totalTokenValue = 0n;      // 包含订单锁定的 token
        let previousAvailable = 0n;    // 上一次的可用量
        let ordersToClose = [];        // 需要平仓的订单索引
        let passOrderIndex = null;     // 跳过的订单索引
        let targetReached = false;     // 是否达到目标
        let finalLpPairsIndex = -1;    // 最终区间索引
        let segments = [];             // 详细的区间信息

        // 计算订单数量是否超限 Check if orders exceed limit
        const hasMoreOrders = orders.length > this.sdk.MAX_ORDERS_COUNT;
        const processableOrders = Math.min(orders.length, this.sdk.MAX_ORDERS_COUNT);

        // 第一步：计算从当前价格到第一个订单前的流动性
        // Step 1: Calculate liquidity from current price to first order
        if (orders.length > 0) {
            const firstOrderStartPrice = BigInt(orders[0].lock_lp_start_price);
            const firstSegmentResult = CurveAMM.buyFromPriceToPrice(currentPrice, firstOrderStartPrice);
            
            if (firstSegmentResult) {
                const [solAmount, tokenAmount] = firstSegmentResult;
                totalAvailableToken += tokenAmount;
                totalTokenValue += tokenAmount;
                
                segments.push({
                    type: 'initial',
                    startPrice: currentPrice,
                    endPrice: firstOrderStartPrice,
                    tokenAmount: tokenAmount,
                    solAmount: solAmount
                });
                
                if (totalAvailableToken >= targetTokenAmount) {
                    targetReached = true;
                    finalLpPairsIndex = -1;
                }
            }
        }

        // 第二步：遍历订单，累积计算
        // Step 2: Iterate orders and calculate cumulatively
        for (let i = 0; i < processableOrders && !targetReached; i++) {
            const order = orders[i];
            const isPassOrder = passOrder && order.order_pda === passOrder;
            
            // 处理订单 Process order
            if (isPassOrder) {
                // 跳过的订单：流动性可用但不平仓
                // Skipped order: liquidity available but not liquidated
                previousAvailable = totalAvailableToken;
                totalAvailableToken += BigInt(order.lock_lp_token_amount);
                totalTokenValue += BigInt(order.lock_lp_token_amount);
                passOrderIndex = i;
                
                segments.push({
                    type: 'order',
                    startPrice: BigInt(order.lock_lp_start_price),
                    endPrice: BigInt(order.lock_lp_end_price),
                    tokenAmount: BigInt(order.lock_lp_token_amount),
                    solAmount: BigInt(order.lock_lp_sol_amount),
                    orderIndex: i,
                    isPassOrder: true
                });
            } else {
                // 需要平仓的订单 Order to be liquidated
                totalTokenValue += BigInt(order.lock_lp_token_amount);
                ordersToClose.push(i);
                
                segments.push({
                    type: 'order',
                    startPrice: BigInt(order.lock_lp_start_price),
                    endPrice: BigInt(order.lock_lp_end_price),
                    tokenAmount: BigInt(order.lock_lp_token_amount),
                    solAmount: BigInt(order.lock_lp_sol_amount),
                    orderIndex: i,
                    isPassOrder: false
                });
            }
            
            // 检查是否达到目标 Check if target reached
            if (totalAvailableToken >= targetTokenAmount) {
                targetReached = true;
                finalLpPairsIndex = i;
                break;
            }
            
            // 检查 next_order Check next_order
            const nextOrderAddress = order.next_order || null;
            if (!nextOrderAddress) {
                // 链表结束，上方有无限空间
                // Chain ends, unlimited space above
                finalLpPairsIndex = i;
                previousAvailable = totalAvailableToken;
                totalAvailableToken = CurveAMM.MAX_U64;
                targetReached = true;
                
                segments.push({
                    type: 'final',
                    startPrice: BigInt(order.lock_lp_end_price),
                    endPrice: CurveAMM.MAX_U128_PRICE,
                    tokenAmount: CurveAMM.MAX_U64,
                    solAmount: CurveAMM.MAX_U64
                });
                break;
            }
            
            // 处理订单间隙 Process gap between orders
            if (i < orders.length - 1 && i < this.sdk.MAX_ORDERS_COUNT - 1) {
                const gapStartPrice = BigInt(order.lock_lp_end_price);
                const gapEndPrice = BigInt(orders[i + 1].lock_lp_start_price);
                
                // 检查间隙是否存在 Check if gap exists
                if (gapStartPrice < gapEndPrice) {
                    const gapResult = CurveAMM.buyFromPriceToPrice(gapStartPrice, gapEndPrice);
                    if (gapResult) {
                        const [gapSol, gapToken] = gapResult;
                        previousAvailable = totalAvailableToken;
                        totalAvailableToken += gapToken;
                        totalTokenValue += gapToken;
                        
                        segments.push({
                            type: 'gap',
                            startPrice: gapStartPrice,
                            endPrice: gapEndPrice,
                            tokenAmount: gapToken,
                            solAmount: gapSol
                        });
                        
                        if (totalAvailableToken >= targetTokenAmount) {
                            targetReached = true;
                            finalLpPairsIndex = i;
                            break;
                        }
                    }
                }
            } else if (i === processableOrders - 1 && hasMoreOrders) {
                // 最后一个可处理订单且还有更多订单
                // Last processable order with more orders beyond
                const lastGapStartPrice = BigInt(order.lock_lp_end_price);
                const lastGapEndPrice = BigInt(orders[i + 1].lock_lp_start_price);
                
                if (lastGapStartPrice < lastGapEndPrice) {
                    const lastGapResult = CurveAMM.buyFromPriceToPrice(lastGapStartPrice, lastGapEndPrice);
                    if (lastGapResult) {
                        const [lastGapSol, lastGapToken] = lastGapResult;
                        previousAvailable = totalAvailableToken;
                        totalAvailableToken += lastGapToken;
                        totalTokenValue += lastGapToken;
                        
                        segments.push({
                            type: 'gap',
                            startPrice: lastGapStartPrice,
                            endPrice: lastGapEndPrice,
                            tokenAmount: lastGapToken,
                            solAmount: lastGapSol
                        });
                        
                        if (totalAvailableToken >= targetTokenAmount) {
                            targetReached = true;
                            finalLpPairsIndex = i;
                        }
                    }
                }
            }
        }

        // 计算理想情况（无订单阻碍）
        // Calculate ideal case (no order obstacles)
        const idealResult = CurveAMM.buyFromPriceWithTokenOutput(currentPrice, targetTokenAmount);
        const [idealEndPrice, idealSolRequired] = idealResult || [0n, 0n];

        // 计算实际参数 Calculate actual parameters
        let actualRequiredSol = 0n;
        let actualObtainableToken = 0n;
        let actualEndPrice = currentPrice;
        let completionRate = 0.0;
        let limitReason = null;

        if (targetReached) {
            // 能完成交易，精确计算所需 SOL
            // Can complete trade, calculate exact SOL needed
            completionRate = 100.0;
            actualObtainableToken = targetTokenAmount;
            
            // 计算精确的结束价格和所需 SOL
            // Calculate exact end price and required SOL
            if (finalLpPairsIndex === -1) {
                // 在第一个区间就完成 Completed in first segment
                const exactResult = CurveAMM.buyFromPriceWithTokenOutput(currentPrice, targetTokenAmount);
                if (exactResult) {
                    actualEndPrice = exactResult[0];
                    actualRequiredSol = exactResult[1];
                }
            } else {
                // 需要跨越多个区间 Need to cross multiple segments
                // 计算剩余需要的 token Calculate remaining token needed
                const remainingToken = targetTokenAmount - previousAvailable;
                
                // 找到最后的起始价格 Find final start price
                let lastStartPrice = currentPrice;
                if (finalLpPairsIndex >= 0 && finalLpPairsIndex < orders.length) {
                    lastStartPrice = BigInt(orders[finalLpPairsIndex].lock_lp_end_price);
                }
                
                // 计算最后区间的精确结果 Calculate exact result for last segment
                const partialResult = CurveAMM.buyFromPriceWithTokenOutput(lastStartPrice, remainingToken);
                if (partialResult) {
                    actualEndPrice = partialResult[0];
                    
                    // 计算总的 SOL 需求 Calculate total SOL requirement
                    const totalResult = CurveAMM.buyFromPriceToPrice(currentPrice, actualEndPrice);
                    if (totalResult) {
                        // 减去订单占用的 SOL Subtract SOL locked in orders
                        let lockedSol = 0n;
                        for (const idx of ordersToClose) {
                            if (idx < orders.length) {
                                lockedSol += BigInt(orders[idx].lock_lp_sol_amount);
                            }
                        }
                        actualRequiredSol = totalResult[0] - lockedSol;
                    }
                }
            }
        } else {
            // 无法完成交易 Cannot complete trade
            actualObtainableToken = Math.min(totalAvailableToken, targetTokenAmount);
            
            if (targetTokenAmount > 0n && totalAvailableToken > 0n) {
                completionRate = Number(totalAvailableToken * 10000n / targetTokenAmount) / 100;
                completionRate = Math.min(99.99, completionRate);
            }
            
            // 判断限制原因 Determine limit reason
            if (hasMoreOrders) {
                limitReason = 'order_count_limit';
            } else if (totalAvailableToken < targetTokenAmount) {
                limitReason = 'insufficient_liquidity';
            } else {
                limitReason = 'unknown';
            }
            
            // 计算能买到的部分所需的 SOL Calculate SOL for obtainable amount
            if (actualObtainableToken > 0n) {
                const partialResult = CurveAMM.buyFromPriceWithTokenOutput(currentPrice, actualObtainableToken);
                if (partialResult) {
                    actualEndPrice = partialResult[0];
                    actualRequiredSol = partialResult[1];
                }
            }
        }

        // 计算价格影响 Calculate price impact
        let priceImpact = null;
        if (targetReached && actualEndPrice > currentPrice) {
            priceImpact = Number((actualEndPrice - currentPrice) * 10000n / currentPrice) / 100;
        }

        // 计算最高可达价格 Calculate max reachable price
        let maxReachablePrice = currentPrice;
        if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1];
            maxReachablePrice = lastSegment.endPrice;
        }

        // 设置成功结果 Set successful result
        result.success = true;
        result.data = {
            // 基本信息 Basic info
            inputType: 'token',
            inputAmount: targetTokenAmount,
            currentPrice: currentPrice,
            
            // 可行性分析 Feasibility analysis
            canComplete: targetReached,
            completionRate: completionRate,
            limitReason: limitReason,
            
            // 理想情况 Ideal case
            idealSolRequired: idealSolRequired,
            idealEndPrice: idealEndPrice,
            
            // 实际情况 Actual case
            actualObtainableToken: actualObtainableToken,
            actualRequiredSol: actualRequiredSol,
            actualEndPrice: actualEndPrice,
            
            // 订单处理 Order processing
            ordersToClose: ordersToClose,
            ordersToCloseCount: ordersToClose.length,
            passOrderIndex: passOrderIndex,
            hasMoreOrders: hasMoreOrders,
            
            // 流动性分析 Liquidity analysis
            totalAvailableToken: totalAvailableToken,
            totalAvailableSol: actualRequiredSol, // 简化处理
            
            // 价格影响 Price impact
            priceImpact: priceImpact,
            maxReachablePrice: maxReachablePrice,
            
            // 详细信息 Detailed info
            segments: segments
        };

    } catch (error) {
        // 捕获意外错误 Catch unexpected errors
        result.errorCode = 'UNEXPECTED_ERROR';
        result.errorMessage = `Unexpected error: ${error.message}`;
    }

    return result;
}


module.exports = {
    simulateBuy,
    simulateTokenBuy
};