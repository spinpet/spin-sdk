const Decimal = require('decimal.js');

// Configure Decimal.js to use 28-bit precision to match rust_decimal
Decimal.set({ precision: 28 });

/**
 * Precision factor used for SOL calculations (10^9)
 * @type {bigint}
 */
const SOL_PRECISION_FACTOR = 1_000_000_000n;

/**
 * Precision factor used for Token calculations (10^6)
 * @type {bigint}
 */
const TOKEN_PRECISION_FACTOR = 1_000_000n;

/**
 * Precision factor used for price calculations (10^28)
 * @type {bigint}
 */
const PRICE_PRECISION_FACTOR = 10_000_000_000_000_000_000_000_000_000n;

/**
 * Denominator used for fee calculations (10^5)
 * @type {bigint}
 */
const FEE_DENOMINATOR = 100_000n;

/**
 * Maximum fee rate (10%)
 * @type {bigint}
 */
const MAX_FEE_RATE = 10_000n;




/**
 * Traditional AMM trading model class
 * Implements constant product (xy=k) algorithm for automated market maker functionality
 * Usage when importing: const CurveAMM = require("../tools/curve_amm");
 */
class CurveAMM {
    /**
     * Initial SOL reserve amount, represented as Decimal
     * @type {Decimal}
     */
    static INITIAL_SOL_RESERVE_DECIMAL = new Decimal('30');

    /**
     * Initial Token reserve amount, represented as Decimal
     * @type {Decimal}
     */
    static INITIAL_TOKEN_RESERVE_DECIMAL = new Decimal('1073000000');

    /**
     * Initial constant K value, represented as Decimal
     * @type {Decimal}
     */
    static INITIAL_K_DECIMAL = new Decimal('32190000000');

    /**
     * Minimum price that can appear, below this price may cause overflow
     * @type {Decimal}
     */
    static INITIAL_MIN_PRICE_DECIMAL = new Decimal('0.000000001');

    /**
     * Decimal representation of precision factor = 10000000000000000000000000000
     * @type {Decimal}
     */
    static PRICE_PRECISION_FACTOR_DECIMAL = new Decimal('10000000000000000000000000000');

    /**
     * Decimal representation of Token precision factor = 1000000
     * @type {Decimal}
     */
    static TOKEN_PRECISION_FACTOR_DECIMAL = new Decimal('1000000');

    /**
     * Decimal representation of SOL precision factor = 1000000000
     * @type {Decimal}
     */
    static SOL_PRECISION_FACTOR_DECIMAL = new Decimal('1000000000');


    /**
     * Maximum price for u128
     * @type {bigint}
     */
    static MAX_U128_PRICE = 6920938463463374607431768211455n;


    /**
     * Minimum price for u128
     * @type {bigint}
     */
    static MIN_U128_PRICE = 11958993476234855500n;


    

    /**
     * Convert u128 price to Decimal
     * 
     * @param {bigint|string|number} price - u128 price to be converted
     * @returns {Decimal} Converted Decimal price
     */
    static u128ToDecimal(price) {
        if (typeof price === 'bigint') {
            price = price.toString();
        }
        const priceDecimal = new Decimal(price);
        return priceDecimal.div(this.PRICE_PRECISION_FACTOR_DECIMAL);
    } 

    /**  
     * Convert Decimal price to u128, rounded down
     * 
     * @param {Decimal} price - Decimal price to be converted
     * @returns {bigint|null} Converted u128 price, returns null if overflow
     */
    static decimalToU128(price) {
        const scaled = price.mul(this.PRICE_PRECISION_FACTOR_DECIMAL);
        const floored = scaled.floor();
        if (floored.isNaN() || floored.isNegative() || floored.gt(this.MAX_U128_PRICE.toString())) {
            return null;
        }
        // Use toFixed() to avoid scientific notation
        const flooredStr = floored.toFixed(0);
        return BigInt(flooredStr);
    }

    /**
     * Convert Decimal price to u128, rounded up
     * 
     * @param {Decimal} price - Decimal price to be converted
     * @returns {bigint|null} Converted u128 price, returns null if overflow
     */
    static decimalToU128Ceil(price) {
        const scaled = price.mul(this.PRICE_PRECISION_FACTOR_DECIMAL);
        const ceiled = scaled.ceil();
        if (ceiled.isNaN() || ceiled.isNegative() || ceiled.gt(this.MAX_U128_PRICE.toString())) {
            return null;
        }
        // Use toFixed() to avoid scientific notation
        const ceiledStr = ceiled.toFixed(0);
        return BigInt(ceiledStr);
    }

    /**
     * Convert u64 price to Decimal (legacy compatibility)
     * 
     * @param {bigint|string|number} price - u64 price to be converted
     * @returns {Decimal} Converted Decimal price
     * @deprecated Please use u128ToDecimal instead
     */
    static u64ToDecimal(price) {
        // Directly use old precision factor for conversion
        if (typeof price === 'bigint') {
            price = price.toString();
        }
        const priceDecimal = new Decimal(price);
        // Use old precision factor 10^15
        const oldPrecisionFactor = new Decimal('1000000000000000');
        return priceDecimal.div(oldPrecisionFactor);
    }

    /**
     * Convert Decimal price to u64, rounded down (legacy compatibility)
     * 
     * @param {Decimal} price - Decimal price to be converted
     * @returns {bigint|null} Converted u64 price, returns null if overflow
     * @deprecated Please use decimalToU128 instead
     */
    static decimalToU64(price) {
        // Directly use old precision factor for conversion
        const oldPrecisionFactor = new Decimal('1000000000000000');
        const scaled = price.mul(oldPrecisionFactor);
        const floored = scaled.floor();
        if (floored.isNaN() || floored.isNegative() || floored.gt('18446744073709551615')) {
            return null;
        }
        const flooredStr = floored.toFixed(0);
        return BigInt(flooredStr);
    }

    /**
     * Convert Decimal price to u64, rounded up (legacy compatibility)
     * 
     * @param {Decimal} price - Decimal price to be converted
     * @returns {bigint|null} Converted u64 price, returns null if overflow
     * @deprecated Please use decimalToU128Ceil instead
     */
    static decimalToU64Ceil(price) {
        // Directly use old precision factor for conversion
        const oldPrecisionFactor = new Decimal('1000000000000000');
        const scaled = price.mul(oldPrecisionFactor);
        const ceiled = scaled.ceil();
        if (ceiled.isNaN() || ceiled.isNegative() || ceiled.gt('18446744073709551615')) {
            return null;
        }
        const ceiledStr = ceiled.toFixed(0);
        return BigInt(ceiledStr);
    }

    /**
     * Convert Decimal token amount to u64, using 6-digit precision, rounded down
     * 
     * @param {Decimal} amount - Decimal token amount to be converted
     * @returns {bigint|null} Converted u64 token amount, returns null if overflow
     */
    static tokenDecimalToU64(amount) {
        const scaled = amount.mul(this.TOKEN_PRECISION_FACTOR_DECIMAL);
        const floored = scaled.floor();
        if (floored.isNaN() || floored.isNegative() || floored.gt('18446744073709551615')) {
            return null;
        }
        const flooredStr = floored.toFixed(0);
        return BigInt(flooredStr);
    }

    /**
     * Convert Decimal token amount to u64, using 6-digit precision, rounded up
     * 
     * @param {Decimal} amount - Decimal token amount to be converted
     * @returns {bigint|null} Converted u64 token amount, returns null if overflow
     */
    static tokenDecimalToU64Ceil(amount) {
        const scaled = amount.mul(this.TOKEN_PRECISION_FACTOR_DECIMAL);
        const ceiled = scaled.ceil();
        if (ceiled.isNaN() || ceiled.isNegative() || ceiled.gt('18446744073709551615')) {
            return null;
        }
        const ceiledStr = ceiled.toFixed(0);
        return BigInt(ceiledStr);
    }

    /**
     * Convert Decimal SOL amount to u64, using 9-digit precision, rounded down
     * 
     * @param {Decimal} amount - Decimal SOL amount to be converted
     * @returns {bigint|null} Converted u64 SOL amount, returns null if overflow
     */
    static solDecimalToU64(amount) {
        const scaled = amount.mul(this.SOL_PRECISION_FACTOR_DECIMAL);
        const floored = scaled.floor();
        if (floored.isNaN() || floored.isNegative() || floored.gt('18446744073709551615')) {
            return null;
        }
        const flooredStr = floored.toFixed(0);
        return BigInt(flooredStr);
    }

    /**
     * Convert Decimal SOL amount to u64, using 9-digit precision, rounded up
     * 
     * @param {Decimal} amount - Decimal SOL amount to be converted
     * @returns {bigint|null} Converted u64 SOL amount, returns null if overflow
     */
    static solDecimalToU64Ceil(amount) {
        const scaled = amount.mul(this.SOL_PRECISION_FACTOR_DECIMAL);
        const ceiled = scaled.ceil();
        if (ceiled.isNaN() || ceiled.isNegative() || ceiled.gt('18446744073709551615')) {
            return null;
        }
        const ceiledStr = ceiled.toFixed(0);
        return BigInt(ceiledStr);
    }

    /**
     * Convert u64 token amount to Decimal, using 6-digit precision
     * 
     * @param {bigint|string|number} amount - u64 token amount to be converted
     * @returns {Decimal} Converted Decimal token amount
     */
    static u64ToTokenDecimal(amount) {
        if (typeof amount === 'bigint') {
            amount = amount.toString();
        }
        const amountDecimal = new Decimal(amount);
        return amountDecimal.div(this.TOKEN_PRECISION_FACTOR_DECIMAL);
    }

    /**
     * Convert u64 SOL amount to Decimal, using 9-digit precision
     * 
     * @param {bigint|string|number} amount - u64 SOL amount to be converted
     * @returns {Decimal} Converted Decimal SOL amount
     */
    static u64ToSolDecimal(amount) {
        if (typeof amount === 'bigint') {
            amount = amount.toString();
        }
        const amountDecimal = new Decimal(amount);
        return amountDecimal.div(this.SOL_PRECISION_FACTOR_DECIMAL);
    }

    /**
     * Calculate initial k value
     * 
     * @returns {Decimal} Product k value of initial reserves
     */
    static calculateInitialK() {
        return this.INITIAL_SOL_RESERVE_DECIMAL.mul(this.INITIAL_TOKEN_RESERVE_DECIMAL);
    }

    /**
     * Get initial price (SOL amount for 1 token)
     * 
     * @returns {bigint|null} Initial price in u128 format, returns null if calculation fails
     */
    static getInitialPrice() {
        // Calculate initial price = initial SOL reserve / initial Token reserve
        const initialPrice = this.INITIAL_SOL_RESERVE_DECIMAL.div(this.INITIAL_TOKEN_RESERVE_DECIMAL);

        // Convert to u128 format
        return this.decimalToU128(initialPrice);
    }

    /**
     * Calculate SOL required and token amount obtained when buying tokens from low to high price
     * 
     * @param {bigint|string|number} startLowPrice - Starting price (lower)
     * @param {bigint|string|number} endHighPrice - Target price (higher)
     * @returns {[bigint, bigint]|null} Returns [SOL amount to invest, token amount to obtain] on success, null on failure
     * SOL amount in 9-digit precision rounded up; token amount in 6-digit precision rounded down 
     */
    static buyFromPriceToPrice(startLowPrice, endHighPrice) {
        // Convert to Decimal for calculation
        const startPriceDec = this.u128ToDecimal(startLowPrice);
        const endPriceDec = this.u128ToDecimal(endHighPrice);

        // Ensure starting price is lower than ending price
        if (startPriceDec.gte(endPriceDec)) {
            return null;
        }

        // Use initial k value
        const k = this.calculateInitialK();

        // Calculate reserves for starting and ending states
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        const endReserves = this.calculateReservesByPrice(endPriceDec, k);

        if (!startReserves || !endReserves) {
            return null;
        }

        const [startSolReserve, startTokenReserve] = startReserves;
        const [endSolReserve, endTokenReserve] = endReserves;

        // Calculate SOL amount to invest (increase in SOL reserves)
        const solInputAmount = endSolReserve.sub(startSolReserve);

        // Calculate token amount to obtain (decrease in token reserves)
        const tokenOutputAmount = startTokenReserve.sub(endTokenReserve);

        // Check if calculation results are valid
        if (solInputAmount.lte(0) || tokenOutputAmount.lte(0)) {
            return null;
        }

        // Convert back to u64
        // SOL uses 9-digit precision rounded up, token uses 6-digit precision rounded down
        const solAmountU64 = this.solDecimalToU64Ceil(solInputAmount);
        const tokenAmountU64 = this.tokenDecimalToU64(tokenOutputAmount);

        if (solAmountU64 === null || tokenAmountU64 === null) {
            return null;
        }

        return [solAmountU64, tokenAmountU64];
    }

    /**
     * Calculate SOL amount obtained when selling tokens from high to low price
     * 
     * @param {bigint|string|number} startHighPrice - Starting price (higher)
     * @param {bigint|string|number} endLowPrice - Target price (lower)
     * @returns {[bigint, bigint]|null} Returns [token amount to sell, SOL amount to obtain] on success, null on failure
     * token amount in 6-digit precision rounded up; SOL amount in 9-digit precision rounded down
     */
    static sellFromPriceToPrice(startHighPrice, endLowPrice) {
        // console.log('\n=== sellFromPriceToPrice debug info ===');
        // console.log('Input parameters:');
        // console.log('  startHighPrice:', startHighPrice);
        // console.log('  endLowPrice:', endLowPrice);

        // Convert to Decimal for calculation
        const startPriceDec = this.u128ToDecimal(startHighPrice);
        const endPriceDec = this.u128ToDecimal(endLowPrice);

        // console.log('Price conversion results:');
        // console.log('  startPriceDec:', startPriceDec.toString());
        // console.log('  endPriceDec:', endPriceDec.toString());

        // Ensure starting price is higher than ending price
        if (startPriceDec.lte(endPriceDec)) {
            // console.log('❌ Failure reason: starting price is lower than or equal to ending price');
            // console.log('  startPriceDec.lte(endPriceDec):', startPriceDec.lte(endPriceDec));
            return null;
        }

        // Use initial k value
        const k = this.calculateInitialK();
        //console.log('k value:', k.toString());

        // Calculate reserves for starting and ending states
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        const endReserves = this.calculateReservesByPrice(endPriceDec, k);

        // console.log('Reserve calculation results:');
        // console.log('  startReserves:', startReserves ? [startReserves[0].toString(), startReserves[1].toString()] : null);
        // console.log('  endReserves:', endReserves ? [endReserves[0].toString(), endReserves[1].toString()] : null);

        // if (!startReserves || !endReserves) {
        //     console.log('❌ Failure reason: reserve calculation failed');
        //     console.log('  startReserves:', startReserves);
        //     console.log('  endReserves:', endReserves);
        //     return null;
        // }

        const [startSolReserve, startTokenReserve] = startReserves;
        const [endSolReserve, endTokenReserve] = endReserves;

        // console.log('Detailed reserves:');
        // console.log('  Starting state - SOL reserve:', startSolReserve.toString());
        // console.log('  Starting state - Token reserve:', startTokenReserve.toString());
        // console.log('  Ending state - SOL reserve:', endSolReserve.toString());
        // console.log('  Ending state - Token reserve:', endTokenReserve.toString());

        // Calculate token amount to sell (increase in token reserves)
        const tokenInputAmount = endTokenReserve.sub(startTokenReserve);

        // Calculate SOL amount to obtain (decrease in SOL reserves)
        const solOutputAmount = startSolReserve.sub(endSolReserve);

        // console.log('Transaction calculation results:');
        // console.log('  Token amount to sell (tokenInputAmount):', tokenInputAmount.toString());
        // console.log('  SOL amount to obtain (solOutputAmount):', solOutputAmount.toString());

        // Check if calculation results are valid
        if (tokenInputAmount.lte(0) || solOutputAmount.lte(0)) {
            // console.log('❌ Failure reason: invalid transaction amount calculation results');
            // console.log('  tokenInputAmount.lte(0):', tokenInputAmount.lte(0));
            // console.log('  solOutputAmount.lte(0):', solOutputAmount.lte(0));
            return null;
        }

        // Convert back to u64
        // token uses 6-digit precision rounded up, SOL uses 9-digit precision rounded down
        const tokenAmountU64 = this.tokenDecimalToU64Ceil(tokenInputAmount);
        const solAmountU64 = this.solDecimalToU64(solOutputAmount);

        // console.log('u64 conversion results:');
        // console.log('  tokenAmountU64:', tokenAmountU64);
        // console.log('  solAmountU64:', solAmountU64);

        if (tokenAmountU64 === null || solAmountU64 === null) {
            // console.log('❌ Failure reason: u64 conversion failed');
            // console.log('  tokenAmountU64 === null:', tokenAmountU64 === null);
            // console.log('  solAmountU64 === null:', solAmountU64 === null);
            return null;
        }

        // console.log('✅ Success! Return results:');
        // console.log('  Token amount to sell:', tokenAmountU64.toString());
        // console.log('  SOL amount to obtain:', solAmountU64.toString());
        // console.log('=== sellFromPriceToPrice debug end ===\n');

        return [tokenAmountU64, solAmountU64];
    }

    /**
     * Calculate reserves given a price
     * 
     * @param {Decimal} price - Price, representing SOL amount for 1 token
     * @param {Decimal} k - Constant product
     * @returns {[Decimal, Decimal]|null} Returns [SOL reserve, token reserve] on success, null on failure
     */
    static calculateReservesByPrice(price, k) {
        // Check if input parameters are valid
        if (price.lte(0) || k.lte(0)) {
            return null;
        }

        // Minimum price check to prevent overflow
        if (price.lt(this.INITIAL_MIN_PRICE_DECIMAL)) {
            return null;
        }

        // According to AMM formula: k = sol_reserve * token_reserve
        // and price = sol_reserve / token_reserve
        // We get: sol_reserve = price * token_reserve
        // Substituting into k formula: k = price * token_reserve^2
        // Therefore: token_reserve = sqrt(k / price)
        // sol_reserve = sqrt(k * price)

        // Calculate k / price
        const kDivPrice = k.div(price);

        // Calculate token_reserve = sqrt(k / price)
        const tokenReserve = kDivPrice.sqrt();

        // Calculate sol_reserve = price * token_reserve
        const solReserve = price.mul(tokenReserve);

        if (tokenReserve.isNaN() || solReserve.isNaN()) {
            return null;
        }

        return [solReserve, tokenReserve];
    }

    /**
     * Calculate token output amount and ending price based on starting price and SOL input amount
     * 
     * @param {bigint|string|number} startLowPrice - Starting price
     * @param {bigint|string|number} solInputAmount - SOL amount for buying
     * @returns {[bigint, bigint]|null} Returns [price after transaction, token amount obtained] on success, null on failure
     * Price rounded down, token amount rounded down
     */
    static buyFromPriceWithSolInput(startLowPrice, solInputAmount) {
        // Convert to Decimal for calculation
        const startPriceDec = this.u128ToDecimal(startLowPrice);
        const solInputDec = this.u64ToSolDecimal(solInputAmount);

        // Check if input parameters are valid
        if (startPriceDec.lte(0)) {
            return null;
        }
        
        // If SOL input amount is 0, return unchanged price and token output of 0
        if (solInputDec.eq(0)) {
            const endPriceU128 = this.decimalToU128(startPriceDec);
            if (endPriceU128 === null) return null;
            return [endPriceU128, 0n];
        }
        
        if (solInputDec.lt(0)) {
            return null;
        }

        // Use initial k value
        const k = this.calculateInitialK();

        // Calculate reserves for starting state
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // Calculate SOL reserves for ending state
        const endSolReserve = startSolReserve.add(solInputDec);

        // Calculate token reserves for ending state according to AMM formula
        const endTokenReserve = k.div(endSolReserve);

        // Calculate token output amount
        const tokenOutputAmount = startTokenReserve.sub(endTokenReserve);

        // Calculate ending price
        const endPrice = endSolReserve.div(endTokenReserve);

        // Check if calculation results are valid
        if (tokenOutputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // Convert back to appropriate types with required rounding
        const endPriceU128 = this.decimalToU128(endPrice); // Price rounded down
        const tokenAmountU64 = this.tokenDecimalToU64(tokenOutputAmount); // Token rounded down

        if (endPriceU128 === null || tokenAmountU64 === null) {
            return null;
        }

        return [endPriceU128, tokenAmountU64];
    }

    /**
     * Calculate SOL output amount and ending price based on starting price and token input amount
     * 
     * @param {bigint|string|number} startHighPrice - Starting price
     * @param {bigint|string|number} tokenInputAmount - Token amount to sell
     * @returns {[bigint, bigint]|null} Returns [price after transaction, SOL amount obtained] on success, null on failure
     * Price rounded down, SOL amount rounded down
     */
    static sellFromPriceWithTokenInput(startHighPrice, tokenInputAmount) {
        // Convert to Decimal for calculation
        const startPriceDec = this.u128ToDecimal(startHighPrice);
        const tokenInputDec = this.u64ToTokenDecimal(tokenInputAmount);

        //console.log("startHighPrice, tokenInputAmount",startHighPrice, tokenInputAmount)
        // Check if input parameters are valid
        if (startPriceDec.lte(0)) {
            return null;
        }
        
        // If token input amount is 0, return unchanged price and SOL output of 0
        if (tokenInputDec.eq(0)) {
            const endPriceU128 = this.decimalToU128(startPriceDec);
            if (endPriceU128 === null) return null;
            return [endPriceU128, 0n];
        }
        
        if (tokenInputDec.lt(0)) {
            return null;
        }

        // Use initial k value
        const k = this.calculateInitialK();

        // Calculate reserves for starting state
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // Calculate token reserves for ending state
        const endTokenReserve = startTokenReserve.add(tokenInputDec);

        // 根据AMM公式计算结束状态的SOL储备量
        const endSolReserve = k.div(endTokenReserve);

        // Calculate SOL output amount
        const solOutputAmount = startSolReserve.sub(endSolReserve);

        // Calculate ending price
        const endPrice = endSolReserve.div(endTokenReserve);

        // Check if calculation results are valid
        if (solOutputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // Convert back to appropriate types with required rounding
        const endPriceU128 = this.decimalToU128(endPrice); // Price rounded down
        const solAmountU64 = this.solDecimalToU64(solOutputAmount); // SOL rounded down

        if (endPriceU128 === null || solAmountU64 === null) {
            return null;
        }

        return [endPriceU128, solAmountU64];
    }

    /**
     * Calculate required SOL input amount and ending price based on starting price and expected token output amount
     * 
     * @param {bigint|string|number} startLowPrice - Starting price
     * @param {bigint|string|number} tokenOutputAmount - Desired token amount to obtain
     * @returns {[bigint, bigint]|null} Returns [price after transaction, SOL amount to pay] on success, null on failure
     * Price rounded down, SOL amount rounded up
     */
    static buyFromPriceWithTokenOutput(startLowPrice, tokenOutputAmount) {
        // Convert to Decimal for calculation
        const startPriceDec = this.u128ToDecimal(startLowPrice);
        const tokenOutputDec = this.u64ToTokenDecimal(tokenOutputAmount);

        // Check if input parameters are valid
        if (startPriceDec.lte(0)) {
            return null;
        }
        
        // If token output amount is 0, return unchanged price and SOL input of 0
        if (tokenOutputDec.eq(0)) {
            const endPriceU128 = this.decimalToU128(startPriceDec);
            if (endPriceU128 === null) return null;
            return [endPriceU128, 0n];
        }
        
        if (tokenOutputDec.lt(0)) {
            return null;
        }

        // Use initial k value
        const k = this.calculateInitialK();

        // Calculate reserves for starting state
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // Calculate token reserves for ending state
        const endTokenReserve = startTokenReserve.sub(tokenOutputDec);

        //console.log('buyFromPriceWithTokenOutput  结束token储备 = 起始token储备 - token输出量:', endTokenReserve.toString());

        // Check if token reserves are sufficient
        if (endTokenReserve.lte(0)) {
            return null;
        }

        // 根据AMM公式计算结束状态的SOL储备量
        const endSolReserve = k.div(endTokenReserve);

        // Calculate required SOL input amount
        const solInputAmount = endSolReserve.sub(startSolReserve);

        // Calculate ending price
        const endPrice = endSolReserve.div(endTokenReserve);

        // Check if calculation results are valid
        if (solInputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // Convert back to appropriate types with required rounding
        const endPriceU128 = this.decimalToU128(endPrice); // Price rounded down
        const solAmountU64 = this.solDecimalToU64Ceil(solInputAmount); // SOL rounded up

        if (endPriceU128 === null || solAmountU64 === null) {
            return null;
        }

        return [endPriceU128, solAmountU64];
    }

    /**
     * Calculate required token input amount and ending price based on starting price and expected SOL output amount
     * 
     * @param {bigint|string|number} startHighPrice - Starting price
     * @param {bigint|string|number} solOutputAmount - Desired SOL amount to obtain
     * @returns {[bigint, bigint]|null} Returns [price after transaction, token amount to pay] on success, null on failure
     * Price rounded down, token amount rounded up
     */
    static sellFromPriceWithSolOutput(startHighPrice, solOutputAmount) {
        // Convert to Decimal for calculation
        const startPriceDec = this.u128ToDecimal(startHighPrice);
        const solOutputDec = this.u64ToSolDecimal(solOutputAmount);

        // Check if input parameters are valid
        if (startPriceDec.lte(0)) {
            return null;
        }
        
        // If SOL output amount is 0, return unchanged price and token input of 0
        if (solOutputDec.eq(0)) {
            const endPriceU128 = this.decimalToU128(startPriceDec);
            if (endPriceU128 === null) return null;
            return [endPriceU128, 0n];
        }
        
        if (solOutputDec.lt(0)) {
            return null;
        }

        // Use initial k value
        const k = this.calculateInitialK();

        // Calculate reserves for starting state
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // Calculate SOL reserves for ending state
        const endSolReserve = startSolReserve.sub(solOutputDec);

        // Check if SOL reserves are sufficient
        if (endSolReserve.lte(0)) {
            return null;
        }

        // Calculate token reserves for ending state according to AMM formula
        const endTokenReserve = k.div(endSolReserve);

        // Calculate required token input amount
        const tokenInputAmount = endTokenReserve.sub(startTokenReserve);

        // Calculate ending price
        const endPrice = endSolReserve.div(endTokenReserve);

        // Check if calculation results are valid
        if (tokenInputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // Convert back to appropriate types with required rounding
        const endPriceU128 = this.decimalToU128(endPrice); // Price rounded down
        const tokenAmountU64 = this.tokenDecimalToU64Ceil(tokenInputAmount); // Token rounded up

        if (endPriceU128 === null || tokenAmountU64 === null) {
            return null;
        }

        return [endPriceU128, tokenAmountU64];
    }

    /**
     * Calculate remaining amount after deducting fees
     * 
     * @param {bigint|string|number} amount - Original amount
     * @param {number} fee - Fee rate, expressed with FEE_DENOMINATOR as denominator
     *                       Example: 1000 represents 1% fee (1000/100000)
     *                               2000 represents 2% fee (2000/100000)
     * @returns {bigint|null} Returns remaining amount after deducting fees on success, null on failure
     * Fee calculation uses floor rounding, which is the most favorable calculation method for users
     */
    static calculateAmountAfterFee(amount, fee) {
        // Convert input parameters to BigInt
        try {
            const amountBigInt = BigInt(amount.toString());
            const feeBigInt = BigInt(fee);

            // Check if fee rate is valid (must be less than or equal to 10%)
            if (feeBigInt > MAX_FEE_RATE) {
                return null;
            }

            // Calculate fee amount: amount * fee / FEE_DENOMINATOR
            const feeAmount = (amountBigInt * feeBigInt) / FEE_DENOMINATOR;

            // Calculate remaining amount after deducting fees
            const amountAfterFee = amountBigInt - feeAmount;

            return amountAfterFee;
        } catch (error) {
            return null;
        }
    }

    /**
     * Convert u128 price to readable decimal string format for display
     * 
     * @param {bigint|string|number} price - u128 price to be converted
     * @param {number} decimalPlaces - Number of decimal places to retain, default is 28
     * @returns {string} Formatted price string
     */
    static formatPriceForDisplay(price, decimalPlaces = 28) {
        if (typeof price === 'bigint') {
            price = price.toString();
        }
        const priceDecimal = new Decimal(price);
        const convertedPrice = priceDecimal.div(this.PRICE_PRECISION_FACTOR_DECIMAL);
        return convertedPrice.toFixed(decimalPlaces);
    }

    /**
     * Create complete price display string, including both integer and decimal formats
     * 
     * @param {bigint|string|number} price - u128 price to be converted
     * @param {number} decimalPlaces - Number of decimal places to retain, default is 28
     * @returns {string} Formatted complete price string, format: "integer price (decimal price)"
     */
    static createPriceDisplayString(price, decimalPlaces = 28) {
        const integerPrice = (typeof price === 'bigint') ? price.toString() : price.toString();
        const decimalPrice = this.formatPriceForDisplay(price, decimalPlaces);
        return `${integerPrice} (${decimalPrice})`;
    }

    /**
     * Calculate price based on liquidity pool reserves (how much SOL 1 token is worth)
     * 
     * @param {bigint|string|number|BN} lpTokenReserve - Token reserves in liquidity pool (u64 format, 6-digit precision)
     * @param {bigint|string|number|BN} lpSolReserve - SOL reserves in liquidity pool (u64 format, 9-digit precision)
     * @returns {string|null} Returns 28-digit decimal price string on success, null on failure
     */
    static calculatePoolPrice(lpTokenReserve, lpSolReserve) {
        try {
            // Handle BN objects, convert to string
            let tokenReserveStr = lpTokenReserve;
            let solReserveStr = lpSolReserve;
            
            // If it's a BN object, use toString() method
            if (lpTokenReserve && typeof lpTokenReserve === 'object' && lpTokenReserve.toString) {
                tokenReserveStr = lpTokenReserve.toString();
            }
            if (lpSolReserve && typeof lpSolReserve === 'object' && lpSolReserve.toString) {
                solReserveStr = lpSolReserve.toString();
            }
            
            // Convert to Decimal for calculation
            const tokenReserveDec = this.u64ToTokenDecimal(tokenReserveStr);
            const solReserveDec = this.u64ToSolDecimal(solReserveStr);
            
            // Check if reserves are valid
            if (tokenReserveDec.lte(0) || solReserveDec.lte(0)) {
                return null;
            }
            
            // Calculate price: 1 token = SOL reserve / Token reserve
            const price = solReserveDec.div(tokenReserveDec);
            
            // Return 28-digit decimal string
            return price.toFixed(28);
        } catch (error) {
            return null;
        }
    }
}

module.exports = CurveAMM;



