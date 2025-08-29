

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
            const mintInfo = await this.sdk.fast.mint_info(mint);
            if (!mintInfo.success || !mintInfo.data || !mintInfo.data.details || mintInfo.data.details.length === 0) {
                result.errorCode = 'API_ERROR';
                result.errorMessage = 'Unable to get token info';
                return result;
            }

            console.log("mintInfo.data.details[0].latest_price ",mintInfo.data.details[0].latest_price)
            if (!mintInfo.data.details[0].latest_price) {
                currentPrice = CurveAMM.getInitialPrice();
            }else{
                currentPrice = BigInt(mintInfo.data.details[0].latest_price);
            }
            
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

module.exports = {
    simulateBuy
};