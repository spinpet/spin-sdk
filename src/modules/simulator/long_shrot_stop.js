
const CurveAMM = require('../../utils/curve_amm');
const {transformOrdersData , checkPriceRangeOverlap} = require('./stop_loss_utils')
const { PRICE_ADJUSTMENT_PERCENTAGE } = require('./utils');

/**
 * Simulate long position stop loss calculation
 * @param {string} mint - Token address
 * @param {bigint|string|number} buyTokenAmount - Token amount to buy for long position (u64 format, precision 10^6)
 * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
 * @param {Object|null} mintInfo - Token info, default null
 * @param {Object|null} ordersData - Orders data, default null
 * @returns {Promise<Object>} Stop loss analysis result
 */
async function simulateLongStopLoss(mint, buyTokenAmount, stopLossPrice, mintInfo = null, ordersData = null) {
    try {
        // Parameter validation
        if (!mint || !buyTokenAmount || !stopLossPrice) {
            throw new Error('Missing required parameters');
        }

        // Get current price
        if (!mintInfo) {
            //console.log('Getting current price...');
            mintInfo = await this.sdk.data.price(mint);
            if (!mintInfo) {
                throw new Error('Failed to get current price');
            }
        }

        // Get ordersData
        if (!ordersData) {
            //console.log('Getting orders data...');
            ordersData = await this.sdk.data.orders(mint, { type: 'down_orders' });
            if (!ordersData || !ordersData.success) {
                throw new Error('Failed to get orders data');
            }
        }

        // Calculate current price
        let currentPrice;
        if (mintInfo === null || mintInfo === undefined || mintInfo === '0') {
            console.log('Current price is empty, using initial price');
            currentPrice = CurveAMM.getInitialPrice();
        } else {
            currentPrice = BigInt(mintInfo);
            if (!currentPrice || currentPrice === 0n) {
                console.log('Current price is 0, using initial price');
                currentPrice = CurveAMM.getInitialPrice();
            }
        }

        // Transform orders data
        const downOrders = transformOrdersData(ordersData);
        //console.log(`Found ${downOrders.length} existing long orders`);

        // Initialize stop loss prices
        let stopLossStartPrice = BigInt(stopLossPrice);
        let stopLossEndPrice;
        let maxIterations = 1000; // Prevent infinite loop
        let iteration = 0;
        let finalOverlapResult = null; // Record final overlap result
        let finalTradeAmount = 0n; // Record final trade amount

        //console.log(`Start price: ${stopLossStartPrice}, Target token amount: ${buyTokenAmount}`);

        // Loop to adjust stop loss price until no overlap
        while (iteration < maxIterations) {
            iteration++;

            // Calculate stop loss end price
            //console.log('Current stop loss start price:', stopLossStartPrice.toString());
            const tradeResult = CurveAMM.sellFromPriceWithTokenInput(stopLossStartPrice, buyTokenAmount);
            if (!tradeResult) {
                throw new Error('Failed to calculate stop loss end price');
            }

            stopLossEndPrice = tradeResult[0]; // Price after trade completion
            const tradeAmount = tradeResult[1]; // SOL输出量 / SOL output amount

            //console.log(`迭代 ${iteration}: 起始价格=${stopLossStartPrice}, 结束价格=${stopLossEndPrice}, SOL输出量=${tradeAmount} / Iteration ${iteration}: Start=${stopLossStartPrice}, End=${stopLossEndPrice}, SOL output=${tradeAmount}`);

            // 检查价格区间重叠 / Check price range overlap
            const overlapResult = checkPriceRangeOverlap('down_orders', downOrders, stopLossStartPrice, stopLossEndPrice);
            
            if (overlapResult.no_overlap) {
                //console.log('价格区间无重叠，可以执行 / No price range overlap, can execute');
                finalOverlapResult = overlapResult; // 记录最终的overlap结果 / Record final overlap result
                finalTradeAmount = tradeAmount; // 记录最终的交易金额 / Record final trade amount
                break;
            }

            //console.log(`发现重叠: ${overlapResult.overlap_reason} / Found overlap: ${overlapResult.overlap_reason}`);

            // 调整起始价格（减少0.5%）/ Adjust start price (decrease by 0.5%)
            // 使用方案2：直接计算 0.5% = 5/1000
            const adjustmentAmount = (stopLossStartPrice * BigInt(PRICE_ADJUSTMENT_PERCENTAGE)) / 1000n;
            stopLossStartPrice = stopLossStartPrice - adjustmentAmount;

            //console.log(`调整后起始价格: ${stopLossStartPrice} / Adjusted start price: ${stopLossStartPrice}`);

            // 安全检查：确保价格不会变成负数 / Safety check: ensure price doesn't become negative
            if (stopLossStartPrice <= 0n) {
                throw new Error('止损价格调整后变为负数，无法继续 / Stop loss price became negative after adjustment');
            }
        }

        if (iteration >= maxIterations) {
            throw new Error('达到最大迭代次数，无法找到合适的止损价格 / Reached maximum iterations, cannot find suitable stop loss price');
        }

        // 计算最终返回值 / Calculate final return values
        const executableStopLossPrice = stopLossStartPrice;
        
        // 计算止损百分比 / Calculate stop loss percentage
        let stopLossPercentage = 0;
        let leverage = 1;
        
        if (currentPrice !== executableStopLossPrice) {
            stopLossPercentage = Number((BigInt(10000) * (currentPrice - executableStopLossPrice)) / currentPrice) / 100;
            leverage = Number((BigInt(10000) * currentPrice) / (currentPrice - executableStopLossPrice)) / 10000;
        }

        // console.log(`Calculation completed:`);
        // console.log(`  Executable stop loss price: ${executableStopLossPrice}`);
        // console.log(`  SOL output amount: ${finalTradeAmount}`);
        // console.log(`  Stop loss percentage: ${stopLossPercentage}%`);
        // console.log(`  Leverage: ${leverage}x`);
        // console.log(`  Previous order PDA: ${finalOverlapResult.prev_order_pda}`);
        // console.log(`  Next order PDA: ${finalOverlapResult.next_order_pda}`);

        return {
            executableStopLossPrice: executableStopLossPrice, // Calculated reasonable stop loss value
            tradeAmount: finalTradeAmount, // SOL output amount
            stopLossPercentage: stopLossPercentage, // Stop loss percentage relative to current price
            leverage: leverage, // Leverage ratio
            currentPrice: currentPrice, // Current price
            iterations: iteration, // Number of adjustments
            originalStopLossPrice: BigInt(stopLossPrice), // Original stop loss price
            prev_order_pda: finalOverlapResult.prev_order_pda, // Previous order PDA
            next_order_pda: finalOverlapResult.next_order_pda // Next order PDA
        };

    } catch (error) {
        console.error('Failed to simulate stop loss calculation:', error.message);
        throw error;
    }
}


/**
 * Simulate short position stop loss calculation
 * @param {string} mint - Token address
 * @param {bigint|string|number} sellTokenAmount - Token amount to sell for short position (u64 format, precision 10^6)
 * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
 * @param {Object|null} mintInfo - Token info, default null
 * @param {Object|null} ordersData - Orders data, default null
 * @returns {Promise<Object>} Stop loss analysis result
 */
async function simulateSellStopLoss(mint, sellTokenAmount, stopLossPrice, mintInfo = null, ordersData = null) {
    try {
        // Parameter validation
        if (!mint || !sellTokenAmount || !stopLossPrice) {
            throw new Error('Missing required parameters');
        }

        // Get current price
        if (!mintInfo) {
            //console.log('Getting current price...');
            mintInfo = await this.sdk.data.price(mint);
            if (!mintInfo) {
                throw new Error('Failed to get current price');
            }
        }

        // Get ordersData
        if (!ordersData) {
            //console.log('Getting orders data...');
            ordersData = await this.sdk.data.orders(mint, { type: 'up_orders' });
            if (!ordersData || !ordersData.success) {
                throw new Error('Failed to get orders data');
            }
        }

        // Calculate current price
        let currentPrice;
        if (mintInfo === null || mintInfo === undefined || mintInfo === '0') {
            console.log('Current price is empty, using initial price');
            currentPrice = CurveAMM.getInitialPrice();
        } else {
            currentPrice = BigInt(mintInfo);
            if (!currentPrice || currentPrice === 0n) {
                console.log('Current price is 0, using initial price');
                currentPrice = CurveAMM.getInitialPrice();
            }
        }

        // Transform orders data
        const upOrders = transformOrdersData(ordersData);
        //console.log(`Found ${upOrders.length} existing short orders`);

        // Initialize stop loss prices
        let stopLossStartPrice = BigInt(stopLossPrice);
        let stopLossEndPrice;
        let maxIterations = 1000; // Prevent infinite loop
        let iteration = 0;
        let finalOverlapResult = null; // Record final overlap result
        let finalTradeAmount = 0n; // Record final trade amount

        //console.log(`Start price: ${stopLossStartPrice}, Target token amount: ${sellTokenAmount}`);

        // Loop to adjust stop loss price until no overlap
        while (iteration < maxIterations) {
            iteration++;

            // Calculate stop loss end price
            const tradeResult = CurveAMM.buyFromPriceWithTokenOutput(stopLossStartPrice, sellTokenAmount);
            if (!tradeResult) {
                throw new Error('Failed to calculate stop loss end price');
            }

            stopLossEndPrice = tradeResult[0]; // Price after trade completion
            const tradeAmount = tradeResult[1]; // SOL输入量 / SOL input amount

            //console.log(`迭代 ${iteration}: 起始价格=${stopLossStartPrice}, 结束价格=${stopLossEndPrice}, SOL输入量=${tradeAmount} / Iteration ${iteration}: Start=${stopLossStartPrice}, End=${stopLossEndPrice}, SOL input=${tradeAmount}`);

            // 检查价格区间重叠 / Check price range overlap
            const overlapResult = checkPriceRangeOverlap('up_orders', upOrders, stopLossStartPrice, stopLossEndPrice);
            
            if (overlapResult.no_overlap) {
                //console.log(' / No price range overlap, can execute');
                finalOverlapResult = overlapResult; // 记录最终的overlap结果 / Record final overlap result
                finalTradeAmount = tradeAmount; // 记录最终的交易金额 / Record final trade amount
                break;
            }

            //console.log(`发现重叠: ${overlapResult.overlap_reason} / Found overlap: ${overlapResult.overlap_reason}`);

            // 调整起始价格（增加0.5%）/ Adjust start price (increase by 0.5%)
            // 使用方案2：直接计算 0.5% = 5/1000
            const adjustmentAmount = (stopLossStartPrice * BigInt(PRICE_ADJUSTMENT_PERCENTAGE)) / 1000n;
            stopLossStartPrice = stopLossStartPrice + adjustmentAmount;

            //console.log(`调整后起始价格: ${stopLossStartPrice} / Adjusted start price: ${stopLossStartPrice}`);

            // 安全检查：确保价格不会超过最大值 / Safety check: ensure price doesn't exceed maximum
            if (stopLossStartPrice >= CurveAMM.MAX_U128_PRICE) {
                throw new Error('Stop loss price exceeded maximum after adjustment');
            }
        }

        if (iteration >= maxIterations) {
            throw new Error('达到最大迭代次数，无法找到合适的止损价格 / Reached maximum iterations, cannot find suitable stop loss price');
        }

        // 计算最终返回值 / Calculate final return values
        const executableStopLossPrice = stopLossStartPrice;
        
        // 计算止损百分比 / Calculate stop loss percentage
        // For short position, stop loss price is higher than current price, so it's a positive percentage
        const stopLossPercentage = Number((BigInt(10000) * (executableStopLossPrice - currentPrice)) / currentPrice) / 100;
        
        // 计算杠杆比例 / Calculate leverage ratio
        // For short position, leverage = current price / (stop loss price - current price)
        const leverage = Number((BigInt(10000) * currentPrice) / (executableStopLossPrice - currentPrice)) / 10000;

        // console.log(`Calculation completed:`);
        // console.log(`  Executable stop loss price: ${executableStopLossPrice}`);
        // console.log(`  SOL input amount: ${finalTradeAmount}`);
        // console.log(`  Stop loss percentage: ${stopLossPercentage}%`);
        // console.log(`  Leverage: ${leverage}x`);
        // console.log(`  Previous order PDA: ${finalOverlapResult.prev_order_pda}`);
        // console.log(`  Next order PDA: ${finalOverlapResult.next_order_pda}`);

        return {
            executableStopLossPrice: executableStopLossPrice, // Calculated reasonable stop loss value
            tradeAmount: finalTradeAmount, // SOL input amount
            stopLossPercentage: stopLossPercentage, // Stop loss percentage relative to current price
            leverage: leverage, // Leverage ratio
            currentPrice: currentPrice, // Current price
            iterations: iteration, // Number of adjustments
            originalStopLossPrice: BigInt(stopLossPrice), // Original stop loss price
            prev_order_pda: finalOverlapResult.prev_order_pda, // Previous order PDA
            next_order_pda: finalOverlapResult.next_order_pda // Next order PDA
        };

    } catch (error) {
        console.error('Failed to simulate short position stop loss calculation:', error.message);
        throw error;
    }
}









module.exports = {
    simulateLongStopLoss,
    simulateSellStopLoss
};