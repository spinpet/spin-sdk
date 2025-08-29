
const CurveAMM = require('../../utils/curve_amm');
const { absoluteValue } = require('./utils');



/**
 * Simulate sell transaction analysis
 * @param {string} mint - Token address
 * @param {bigint|string|number} sellTokenAmount - Token amount to sell (u64 format, precision 10^6)
 * @returns {Promise<Object>} Sell analysis result
 */
async function simulateSell(mint, sellTokenAmount) {
    try {
        // 1. Parameter validation
        if (!mint || typeof mint !== 'string') {
            return {
                success: false,
                errorCode: 'PARAM_ERROR',
                errorMessage: 'Token address must be a valid string',
                data: null
            };
        }

        if (sellTokenAmount === undefined || sellTokenAmount === null) {
            return {
                success: false,
                errorCode: 'PARAM_ERROR',
                errorMessage: 'Sell token amount cannot be empty',
                data: null
            };
        }

        // Convert to bigint
        let sellTokenAmountU64;
        try {
            sellTokenAmountU64 = typeof sellTokenAmount === 'bigint' ? sellTokenAmount : BigInt(sellTokenAmount);
            if (sellTokenAmountU64 <= 0n) {
                throw new Error('Amount must be greater than 0');
            }
        } catch (error) {
            return {
                success: false,
                errorCode: 'PARAM_ERROR',
                errorMessage: `Invalid token amount: ${error.message}`,
                data: null
            };
        }

        // 2. Get current price
        let currentPriceData;
        try {
            currentPriceData = await this.sdk.fast.mint_info(mint);
            if (!currentPriceData.success || !currentPriceData.data || currentPriceData.data.length === 0) {
                return {
                    success: false,
                    errorCode: 'API_ERROR',
                    errorMessage: 'Cannot get token price information',
                    data: null
                };
            }
        } catch (error) {
            return {
                success: false,
                errorCode: 'API_ERROR',
                errorMessage: `获取价格信息失败: ${error.message} / Failed to get price info: ${error.message}`,
                data: null
            };
        }

        const tokenInfo = currentPriceData.data.details[0];

        let currentPriceU64;

        if (!tokenInfo.latest_price) {
            currentPriceU64 = CurveAMM.getInitialPrice();
        }else{
            currentPriceU64 = BigInt(tokenInfo.latest_price);
        }


        // 3. 获取做多订单列表 / Get long order list (down_orders)
        let ordersData;
        try {
            ordersData = await this.sdk.data.orders(mint, {
                type: 'down_orders',
                limit: 500
            });
            if (!ordersData.success) {
                return {
                    success: false,
                    errorCode: 'API_ERROR',
                    errorMessage: '无法获取做多订单数据 / Cannot get long order data',
                    data: null
                };
            }
        } catch (error) {
            return {
                success: false,
                errorCode: 'API_ERROR',
                errorMessage: `获取订单数据失败: ${error.message} / Failed to get order data: ${error.message}`,
                data: null
            };
        }

        // 4. 转换订单数据格式 / Convert order data format
        const longOrderList = ordersData.data.orders.map(order => ({
            ...order,
            lockLpStartPrice: order.lock_lp_start_price,
            lockLpEndPrice: order.lock_lp_end_price,
            lockLpSolAmount: BigInt(order.lock_lp_sol_amount),
            lockLpTokenAmount: BigInt(order.lock_lp_token_amount)
        }));

        // 如果没有订单，添加 null 表示无限制
        if (longOrderList.length === 0) {
            longOrderList.push(null);
        }

        // 5. 开始 AMM 计算 / Start AMM calculation
        // 计算理想情况下的基准SOL数量（完全无滑点）
        const idealTradeResult = CurveAMM.sellFromPriceWithTokenInput(currentPriceU64, sellTokenAmountU64);
        let idealSolAmount = 0n;
        if (idealTradeResult) {
            idealSolAmount = idealTradeResult[1];
        }
        const idealTokenAmount = sellTokenAmountU64;

        // 初始化价格区间和流动性相关变量
        let totalPriceSpan = 0n;
        let totalLiquiditySolAmount = 0n;
        let totalLiquidityTokenAmount = 0n;
        let targetReachedAtSegmentIndex = -1;
        let minAllowedPrice = 0n;

        // 构建价格区间分析列表
        const priceSegmentAnalysisList = new Array(longOrderList.length);

        // 遍历订单列表并计算每个价格区间的参数
        for (let segmentIndex = 0; segmentIndex < longOrderList.length; segmentIndex++) {
            let segmentStartPrice, segmentEndPrice;

            // 根据区间位置确定起始和结束价格
            if (segmentIndex === 0) {
                // 第一个区间：从当前价格开始（向下卖出）
                segmentStartPrice = currentPriceU64;

                if (longOrderList[0] === null) {
                    // 如果第一个订单就是null，表示没有任何订单
                    segmentEndPrice = CurveAMM.MIN_U128_PRICE; // 最低价格
                    minAllowedPrice = CurveAMM.MIN_U128_PRICE; // 无限制到最低价格
                } else {
                    // 到第一个订单结束价格的下一个单位
                    segmentEndPrice = BigInt(longOrderList[0].lockLpStartPrice);
                    minAllowedPrice = BigInt(longOrderList[0].lockLpStartPrice);
                }
            } else if (longOrderList[segmentIndex] === null) {
                // 当前遍历到null（链表结束）
                segmentStartPrice = BigInt(longOrderList[segmentIndex - 1].lockLpEndPrice);
                segmentEndPrice = CurveAMM.MIN_U128_PRICE; // 到最低价格
            } else {
                // 普通情况：位于两个订单之间的空隙
                segmentStartPrice = BigInt(longOrderList[segmentIndex - 1].lockLpEndPrice);
                segmentEndPrice = BigInt(longOrderList[segmentIndex].lockLpStartPrice);
            }

            // 验证价格区间的有效性
            if (segmentStartPrice < segmentEndPrice) {
                // 价格区间无效，跳过（卖出时起始价格应该高于结束价格）
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    obtainedSolAmount: null,
                    consumedTokenAmount: null,
                    isValid: false
                };
                continue;
            }

            if (segmentStartPrice === segmentEndPrice) {
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    obtainedSolAmount: 0n,
                    consumedTokenAmount: 0n,
                    isValid: true
                };
                continue;
            }

            // 使用AMM计算该区间的交易参数（卖出：从高价格到低价格）
            const segmentTradeResult = CurveAMM.sellFromPriceToPrice(segmentStartPrice, segmentEndPrice);

            if (!segmentTradeResult) {
                // AMM计算失败
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    obtainedSolAmount: null,
                    consumedTokenAmount: null,
                    isValid: false
                };
            } else {
                // 计算成功，保存结果
                const [consumedTokenAmount, obtainedSolAmount] = segmentTradeResult;
                priceSegmentAnalysisList[segmentIndex] = {
                    startPrice: segmentStartPrice,
                    endPrice: segmentEndPrice,
                    obtainedSolAmount,
                    consumedTokenAmount,
                    isValid: true
                };
            }
        }

        // 累计计算总流动性深度
        for (let i = 0; i < priceSegmentAnalysisList.length; i++) {
            const segment = priceSegmentAnalysisList[i];

            if (segment.isValid && segment.obtainedSolAmount !== null && segment.consumedTokenAmount !== null) {
                totalLiquiditySolAmount += BigInt(segment.obtainedSolAmount);
                totalLiquidityTokenAmount += BigInt(segment.consumedTokenAmount);

                // Token输入：检查累计的Token数量是否已经达到目标
                if (totalLiquidityTokenAmount >= sellTokenAmountU64 && targetReachedAtSegmentIndex === -1) {
                    targetReachedAtSegmentIndex = i;
                }
            }
        }

        // 计算实际交易参数
        let actualObtainedSolAmount = 0n;
        let actualConsumedTokenAmount = 0n;
        let transactionCompletionRate = 0.0;

        if (targetReachedAtSegmentIndex !== -1) {
            // 可以100%完成交易
            transactionCompletionRate = 100.0;

            for (let i = 0; i <= targetReachedAtSegmentIndex; i++) {
                const currentSegment = priceSegmentAnalysisList[i];

                if (i === targetReachedAtSegmentIndex) {
                    // 最后一个区间：可能只需要部分交易
                    // Token输入：计算剩余需要卖出的Token
                    const remainingTokenToSell = sellTokenAmountU64 - actualConsumedTokenAmount;
                    const partialTradeResult = CurveAMM.sellFromPriceWithTokenInput(
                        currentSegment.startPrice,
                        remainingTokenToSell
                    );

                    if (partialTradeResult) {
                        const [finalPrice, obtainedSolForPartial] = partialTradeResult;
                        actualObtainedSolAmount += obtainedSolForPartial;
                        actualConsumedTokenAmount += remainingTokenToSell;
                        totalPriceSpan += absoluteValue(currentSegment.startPrice - finalPrice) + 1n;
                    }
                } else {
                    // 完整使用该区间
                    actualObtainedSolAmount += currentSegment.obtainedSolAmount;
                    actualConsumedTokenAmount += currentSegment.consumedTokenAmount;
                    totalPriceSpan += absoluteValue(currentSegment.startPrice - currentSegment.endPrice) + 1n;
                }
            }
        } else {
            // 无法完全完成交易，使用所有可用流动性
            for (let i = 0; i < priceSegmentAnalysisList.length; i++) {
                const segment = priceSegmentAnalysisList[i];
                if (segment.isValid) {
                    actualObtainedSolAmount += segment.obtainedSolAmount;
                    actualConsumedTokenAmount += segment.consumedTokenAmount;
                    totalPriceSpan += absoluteValue(segment.startPrice - segment.endPrice) + 1n;
                }
            }

            // 计算交易完成率
            if (sellTokenAmountU64 > 0n) {
                transactionCompletionRate = parseFloat(
                    CurveAMM.u64ToTokenDecimal(actualConsumedTokenAmount)
                        .div(CurveAMM.u64ToTokenDecimal(sellTokenAmountU64))
                        .mul(100)
                        .toFixed(2)
                );
            }

            // 重新计算理论参数（基于实际可达到的数量）
            const theoreticalTradeResult = CurveAMM.sellFromPriceWithTokenInput(currentPriceU64, actualConsumedTokenAmount);
            if (theoreticalTradeResult) {
                const [, theoreticalSolObtained] = theoreticalTradeResult;
                // 更新理论SOL数量
            }
        }

        // 计算最小滑点百分比
        const minimumSlippagePercentage = Math.abs(
            100.0 * (
                CurveAMM.u64ToSolDecimal(idealSolAmount)
                    .minus(CurveAMM.u64ToSolDecimal(actualObtainedSolAmount))
                    .div(CurveAMM.u64ToSolDecimal(idealSolAmount))
                    .toNumber()
            )
        );

        // 6. 返回分析结果 / Return analysis result
        return {
            success: true,
            errorCode: null,
            errorMessage: null,
            data: {
                inputType: 'token',
                inputAmount: sellTokenAmountU64,
                minAllowedPrice: minAllowedPrice,
                totalPriceSpan: totalPriceSpan,
                transactionCompletionRate: transactionCompletionRate,
                idealSolAmount: idealSolAmount,
                idealTokenAmount: idealTokenAmount,
                actualObtainedSolAmount: actualObtainedSolAmount,
                actualConsumedTokenAmount: actualConsumedTokenAmount,
                theoreticalSolAmount: idealSolAmount, // 理论目标SOL数量
                minimumSlippagePercentage: minimumSlippagePercentage,
                totalLiquiditySolAmount: totalLiquiditySolAmount,
                totalLiquidityTokenAmount: totalLiquidityTokenAmount
            }
        };

    } catch (error) {
        return {
            success: false,
            errorCode: 'DATA_ERROR',
            errorMessage: `计算过程中发生错误: ${error.message} / Error during calculation: ${error.message}`,
            data: null
        };
    }
}


module.exports = {
    simulateSell
};