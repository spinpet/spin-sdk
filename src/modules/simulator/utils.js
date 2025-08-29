

// Liquidity reservation ratio - how much liquidity to reserve relative to the last locked liquidity
const LIQUIDITY_RESERVATION = 100;  // 100%

// Price adjustment percentage
const PRICE_ADJUSTMENT_PERCENTAGE = 5; //  5就是 0.5%


/**
 * Convert API order format to expected format
 * @param {Array} apiOrders - Orders returned from API
 * @returns {Array} Converted order list
 */
function convertApiOrdersFormat(apiOrders) {
    if (!apiOrders || !Array.isArray(apiOrders)) {
        return [];
    }

    return apiOrders.map(order => ({
        ...order,
        lockLpStartPrice: order.lock_lp_start_price,
        lockLpEndPrice: order.lock_lp_end_price
    }));
}


/**
 * Handle BigInt absolute value
 * @param {BigInt} value - BigInt value to calculate absolute value
 * @returns {BigInt} Absolute value result
 */
function absoluteValue(value) {
    return value < 0n ? -value : value;
}



module.exports = {
    convertApiOrdersFormat,
    absoluteValue,
    LIQUIDITY_RESERVATION,
    PRICE_ADJUSTMENT_PERCENTAGE
};