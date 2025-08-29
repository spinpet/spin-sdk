const CurveAMM = require('../utils/curve_amm');
const { simulateLongStopLoss,simulateSellStopLoss } = require('./simulator/long_shrot_stop');
const { simulateBuy } = require('./simulator/buy');
const { simulateSell } = require('./simulator/sell');




/**
 * Simulator Module Class
 */
class SimulatorModule {
    constructor(sdk) {
        this.sdk = sdk;

        // Liquidity reservation ratio - how much liquidity to reserve relative to the last locked liquidity
        this.LIQUIDITY_RESERVATION = 100; // 100%;
        // Price adjustment percentage
        this.PRICE_ADJUSTMENT_PERCENTAGE = 0.5; // 0.5%
    }

    /**
     * Simulate buy transaction analysis
     * @param {string} mint - Token address
     * @param {bigint|string|number} buySolAmount - SOL amount to buy (u64 format, precision 10^9)
     * @returns {Promise<Object>} Buy analysis result
     */
    async simulateBuy(mint, buySolAmount) {
        return simulateBuy.call(this, mint, buySolAmount);
    }

    /**
     * Simulate sell transaction analysis
     * @param {string} mint - Token address
     * @param {bigint|string|number} sellTokenAmount - Token amount to sell (u64 format, precision 10^6)
     * @returns {Promise<Object>} Sell analysis result
     */
    async simulateSell(mint, sellTokenAmount) {
        return simulateSell.call(this, mint, sellTokenAmount);
    }

    /**
     * Simulate long position stop loss calculation
     * @param {string} mint - Token address
     * @param {bigint|string|number} buyTokenAmount - Token amount to buy for long position (u64 format, precision 10^6)
     * @param {bigint|string|number} stopLossPrice - User desired stop loss price (u128 format)
     * @param {Object|null} mintInfo - Token info, default null
     * @param {Object|null} ordersData - Orders data, default null
     * @returns {Promise<Object>} Stop loss analysis result
     */
    async simulateLongStopLoss(mint, buyTokenAmount, stopLossPrice, mintInfo = null, ordersData = null) {
        return simulateLongStopLoss.call(this, mint, buyTokenAmount, stopLossPrice, mintInfo, ordersData);
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
    async simulateSellStopLoss(mint, sellTokenAmount, stopLossPrice, mintInfo = null, ordersData = null) {
        return simulateSellStopLoss.call(this, mint, sellTokenAmount, stopLossPrice, mintInfo, ordersData);
    }



    
}

module.exports = SimulatorModule;
