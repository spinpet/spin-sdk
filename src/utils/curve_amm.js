const Decimal = require('decimal.js');

// 配置Decimal.js使用28位精度以匹配rust_decimal
Decimal.set({ precision: 28 });

/**
 * SOL计算使用的精度因子 (10^9)
 * @type {bigint}
 */
const SOL_PRECISION_FACTOR = 1_000_000_000n;

/**
 * Token计算使用的精度因子 (10^6)
 * @type {bigint}
 */
const TOKEN_PRECISION_FACTOR = 1_000_000n;

/**
 * 价格计算使用的精度因子 (10^28)
 * @type {bigint}
 */
const PRICE_PRECISION_FACTOR = 10_000_000_000_000_000_000_000_000_000n;

/**
 * 手续费计算使用的分母 (10^5)
 * @type {bigint}
 */
const FEE_DENOMINATOR = 100_000n;

/**
 * 最大手续费率（10%）
 * @type {bigint}
 */
const MAX_FEE_RATE = 10_000n;




/**
 * 传统AMM交易模型类
 * 实现恒定乘积（xy=k）算法的自动做市商功能
 * 导入时使用:  const CurveAMM = require("../tools/curve_amm");
 */
class CurveAMM {
    /**
     * 初始SOL储备量，Decimal表示
     * @type {Decimal}
     */
    static INITIAL_SOL_RESERVE_DECIMAL = new Decimal('30');

    /**
     * 初始Token储备量，Decimal表示
     * @type {Decimal}
     */
    static INITIAL_TOKEN_RESERVE_DECIMAL = new Decimal('1073000000');

    /**
     * 初始常数K值，Decimal表示
     * @type {Decimal}
     */
    static INITIAL_K_DECIMAL = new Decimal('32190000000');

    /**
     * 可以出现的最小价格，低于这个价格，可能溢出
     * @type {Decimal}
     */
    static INITIAL_MIN_PRICE_DECIMAL = new Decimal('0.000000001');

    /**
     * 精度因子的Decimal表示 = 10000000000000000000000000000
     * @type {Decimal}
     */
    static PRICE_PRECISION_FACTOR_DECIMAL = new Decimal('10000000000000000000000000000');

    /**
     * Token精度因子的Decimal表示 = 1000000
     * @type {Decimal}
     */
    static TOKEN_PRECISION_FACTOR_DECIMAL = new Decimal('1000000');

    /**
     * SOL精度因子的Decimal表示 = 1000000000
     * @type {Decimal}
     */
    static SOL_PRECISION_FACTOR_DECIMAL = new Decimal('1000000000');


    /**
     * u128 的最高价格
     * @type {bigint}
     */
    static MAX_U128_PRICE = 6920938463463374607431768211455n;


    /**
     * u128 的最低价格
     * @type {bigint}
     */
    static MIN_U128_PRICE = 119589934762348555452n;


    

    /**
     * 将u128价格转换为Decimal
     * 
     * @param {bigint|string|number} price - 需要转换的u128价格
     * @returns {Decimal} 转换后的Decimal价格
     */
    static u128ToDecimal(price) {
        if (typeof price === 'bigint') {
            price = price.toString();
        }
        const priceDecimal = new Decimal(price);
        return priceDecimal.div(this.PRICE_PRECISION_FACTOR_DECIMAL);
    } 

    /**  
     * 将Decimal价格转换为u128，向下取整
     * 
     * @param {Decimal} price - 需要转换的Decimal价格
     * @returns {bigint|null} 转换后的u128价格，如果溢出则返回null
     */
    static decimalToU128(price) {
        const scaled = price.mul(this.PRICE_PRECISION_FACTOR_DECIMAL);
        const floored = scaled.floor();
        if (floored.isNaN() || floored.isNegative() || floored.gt(this.MAX_U128_PRICE.toString())) {
            return null;
        }
        // 使用toFixed()避免科学计数法
        const flooredStr = floored.toFixed(0);
        return BigInt(flooredStr);
    }

    /**
     * 将Decimal价格转换为u128，向上取整
     * 
     * @param {Decimal} price - 需要转换的Decimal价格
     * @returns {bigint|null} 转换后的u128价格，如果溢出则返回null
     */
    static decimalToU128Ceil(price) {
        const scaled = price.mul(this.PRICE_PRECISION_FACTOR_DECIMAL);
        const ceiled = scaled.ceil();
        if (ceiled.isNaN() || ceiled.isNegative() || ceiled.gt(this.MAX_U128_PRICE.toString())) {
            return null;
        }
        // 使用toFixed()避免科学计数法
        const ceiledStr = ceiled.toFixed(0);
        return BigInt(ceiledStr);
    }

    /**
     * 将u64价格转换为Decimal（兼容旧版本）
     * 
     * @param {bigint|string|number} price - 需要转换的u64价格
     * @returns {Decimal} 转换后的Decimal价格
     * @deprecated 请使用 u128ToDecimal 代替
     */
    static u64ToDecimal(price) {
        // 直接使用旧的精度因子进行转换
        if (typeof price === 'bigint') {
            price = price.toString();
        }
        const priceDecimal = new Decimal(price);
        // 使用旧的精度因子 10^15
        const oldPrecisionFactor = new Decimal('1000000000000000');
        return priceDecimal.div(oldPrecisionFactor);
    }

    /**
     * 将Decimal价格转换为u64，向下取整（兼容旧版本）
     * 
     * @param {Decimal} price - 需要转换的Decimal价格
     * @returns {bigint|null} 转换后的u64价格，如果溢出则返回null
     * @deprecated 请使用 decimalToU128 代替
     */
    static decimalToU64(price) {
        // 直接使用旧的精度因子进行转换
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
     * 将Decimal价格转换为u64，向上取整（兼容旧版本）
     * 
     * @param {Decimal} price - 需要转换的Decimal价格
     * @returns {bigint|null} 转换后的u64价格，如果溢出则返回null
     * @deprecated 请使用 decimalToU128Ceil 代替
     */
    static decimalToU64Ceil(price) {
        // 直接使用旧的精度因子进行转换
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
     * 将Decimal token数量转换为u64，使用6位精度，向下取整
     * 
     * @param {Decimal} amount - 需要转换的Decimal token数量
     * @returns {bigint|null} 转换后的u64 token数量，如果溢出则返回null
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
     * 将Decimal token数量转换为u64，使用6位精度，向上取整
     * 
     * @param {Decimal} amount - 需要转换的Decimal token数量
     * @returns {bigint|null} 转换后的u64 token数量，如果溢出则返回null
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
     * 将Decimal SOL数量转换为u64，使用9位精度，向下取整
     * 
     * @param {Decimal} amount - 需要转换的Decimal SOL数量
     * @returns {bigint|null} 转换后的u64 SOL数量，如果溢出则返回null
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
     * 将Decimal SOL数量转换为u64，使用9位精度，向上取整
     * 
     * @param {Decimal} amount - 需要转换的Decimal SOL数量
     * @returns {bigint|null} 转换后的u64 SOL数量，如果溢出则返回null
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
     * 将u64 token数量转换为Decimal，使用6位精度
     * 
     * @param {bigint|string|number} amount - 需要转换的u64 token数量
     * @returns {Decimal} 转换后的Decimal token数量
     */
    static u64ToTokenDecimal(amount) {
        if (typeof amount === 'bigint') {
            amount = amount.toString();
        }
        const amountDecimal = new Decimal(amount);
        return amountDecimal.div(this.TOKEN_PRECISION_FACTOR_DECIMAL);
    }

    /**
     * 将u64 SOL数量转换为Decimal，使用9位精度
     * 
     * @param {bigint|string|number} amount - 需要转换的u64 SOL数量
     * @returns {Decimal} 转换后的Decimal SOL数量
     */
    static u64ToSolDecimal(amount) {
        if (typeof amount === 'bigint') {
            amount = amount.toString();
        }
        const amountDecimal = new Decimal(amount);
        return amountDecimal.div(this.SOL_PRECISION_FACTOR_DECIMAL);
    }

    /**
     * 计算初始k值
     * 
     * @returns {Decimal} 初始储备量的乘积k值
     */
    static calculateInitialK() {
        return this.INITIAL_SOL_RESERVE_DECIMAL.mul(this.INITIAL_TOKEN_RESERVE_DECIMAL);
    }

    /**
     * 获取初始价格（1个token兑换的SOL数量）
     * 
     * @returns {bigint|null} 以u128表示的初始价格，如果计算失败则返回null
     */
    static getInitialPrice() {
        // 计算初始价格 = 初始SOL储备 / 初始Token储备
        const initialPrice = this.INITIAL_SOL_RESERVE_DECIMAL.div(this.INITIAL_TOKEN_RESERVE_DECIMAL);

        // 转换为u128格式
        return this.decimalToU128(initialPrice);
    }

    /**
     * 计算从低价到高价购买token需要的SOL和获得的token数量
     * 
     * @param {bigint|string|number} startLowPrice - 开始价格（较低）
     * @param {bigint|string|number} endHighPrice - 目标价格（较高）
     * @returns {[bigint, bigint]|null} 成功则返回[需要投入的SOL数量, 能获得的token数量]，失败则返回null
     * SOL数量以9位精度表示，向上取整；token数量以6位精度表示，向下取整 
     */
    static buyFromPriceToPrice(startLowPrice, endHighPrice) {
        // 转换为Decimal进行计算
        const startPriceDec = this.u128ToDecimal(startLowPrice);
        const endPriceDec = this.u128ToDecimal(endHighPrice);

        // 确保起始价格低于结束价格
        if (startPriceDec.gte(endPriceDec)) {
            return null;
        }

        // 使用初始k值
        const k = this.calculateInitialK();

        // 计算起始和结束状态的储备量
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        const endReserves = this.calculateReservesByPrice(endPriceDec, k);

        if (!startReserves || !endReserves) {
            return null;
        }

        const [startSolReserve, startTokenReserve] = startReserves;
        const [endSolReserve, endTokenReserve] = endReserves;

        // 计算需要投入的SOL数量（SOL储备的增加量）
        const solInputAmount = endSolReserve.sub(startSolReserve);

        // 计算能获得的token数量（token储备的减少量）
        const tokenOutputAmount = startTokenReserve.sub(endTokenReserve);

        // 检查计算结果是否有效
        if (solInputAmount.lte(0) || tokenOutputAmount.lte(0)) {
            return null;
        }

        // 转换回u64
        // SOL使用9位精度向上取整，token使用6位精度向下取整
        const solAmountU64 = this.solDecimalToU64Ceil(solInputAmount);
        const tokenAmountU64 = this.tokenDecimalToU64(tokenOutputAmount);

        if (solAmountU64 === null || tokenAmountU64 === null) {
            return null;
        }

        return [solAmountU64, tokenAmountU64];
    }

    /**
     * 计算从高价到低价出售token能获得的SOL数量
     * 
     * @param {bigint|string|number} startHighPrice - 开始价格（较高）
     * @param {bigint|string|number} endLowPrice - 目标价格（较低）
     * @returns {[bigint, bigint]|null} 成功则返回[需要出售的token数量, 获得的SOL数量]，失败则返回null
     * token数量以6位精度表示，向上取整；SOL数量以9位精度表示，向下取整
     */
    static sellFromPriceToPrice(startHighPrice, endLowPrice) {
        // console.log('\n=== sellFromPriceToPrice 调试信息 ===');
        // console.log('输入参数:');
        // console.log('  startHighPrice:', startHighPrice);
        // console.log('  endLowPrice:', endLowPrice);

        // 转换为Decimal进行计算
        const startPriceDec = this.u128ToDecimal(startHighPrice);
        const endPriceDec = this.u128ToDecimal(endLowPrice);

        // console.log('价格转换结果:');
        // console.log('  startPriceDec:', startPriceDec.toString());
        // console.log('  endPriceDec:', endPriceDec.toString());

        // 确保起始价格高于结束价格
        if (startPriceDec.lte(endPriceDec)) {
            // console.log('❌ 失败原因: 起始价格低于或等于结束价格');
            // console.log('  startPriceDec.lte(endPriceDec):', startPriceDec.lte(endPriceDec));
            return null;
        }

        // 使用初始k值
        const k = this.calculateInitialK();
        //console.log('k值:', k.toString());

        // 计算起始和结束状态的储备量
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        const endReserves = this.calculateReservesByPrice(endPriceDec, k);

        // console.log('储备量计算结果:');
        // console.log('  startReserves:', startReserves ? [startReserves[0].toString(), startReserves[1].toString()] : null);
        // console.log('  endReserves:', endReserves ? [endReserves[0].toString(), endReserves[1].toString()] : null);

        // if (!startReserves || !endReserves) {
        //     console.log('❌ 失败原因: 储备量计算失败');
        //     console.log('  startReserves:', startReserves);
        //     console.log('  endReserves:', endReserves);
        //     return null;
        // }

        const [startSolReserve, startTokenReserve] = startReserves;
        const [endSolReserve, endTokenReserve] = endReserves;

        // console.log('详细储备量:');
        // console.log('  起始状态 - SOL储备:', startSolReserve.toString());
        // console.log('  起始状态 - Token储备:', startTokenReserve.toString());
        // console.log('  结束状态 - SOL储备:', endSolReserve.toString());
        // console.log('  结束状态 - Token储备:', endTokenReserve.toString());

        // 计算需要出售的token数量（token储备的增加量）
        const tokenInputAmount = endTokenReserve.sub(startTokenReserve);

        // 计算能获得的SOL数量（SOL储备的减少量）
        const solOutputAmount = startSolReserve.sub(endSolReserve);

        // console.log('交易计算结果:');
        // console.log('  需要出售的token数量 (tokenInputAmount):', tokenInputAmount.toString());
        // console.log('  能获得的SOL数量 (solOutputAmount):', solOutputAmount.toString());

        // 检查计算结果是否有效
        if (tokenInputAmount.lte(0) || solOutputAmount.lte(0)) {
            // console.log('❌ 失败原因: 交易量计算结果无效');
            // console.log('  tokenInputAmount.lte(0):', tokenInputAmount.lte(0));
            // console.log('  solOutputAmount.lte(0):', solOutputAmount.lte(0));
            return null;
        }

        // 转换回u64
        // token使用6位精度向上取整，SOL使用9位精度向下取整
        const tokenAmountU64 = this.tokenDecimalToU64Ceil(tokenInputAmount);
        const solAmountU64 = this.solDecimalToU64(solOutputAmount);

        // console.log('u64转换结果:');
        // console.log('  tokenAmountU64:', tokenAmountU64);
        // console.log('  solAmountU64:', solAmountU64);

        if (tokenAmountU64 === null || solAmountU64 === null) {
            // console.log('❌ 失败原因: u64转换失败');
            // console.log('  tokenAmountU64 === null:', tokenAmountU64 === null);
            // console.log('  solAmountU64 === null:', solAmountU64 === null);
            return null;
        }

        // console.log('✅ 成功! 返回结果:');
        // console.log('  需要出售的token数量:', tokenAmountU64.toString());
        // console.log('  能获得的SOL数量:', solAmountU64.toString());
        // console.log('=== sellFromPriceToPrice 调试结束 ===\n');

        return [tokenAmountU64, solAmountU64];
    }

    /**
     * 给定价格，计算储备量
     * 
     * @param {Decimal} price - 价格，表示1个token兑换的SOL数量
     * @param {Decimal} k - 常量乘积
     * @returns {[Decimal, Decimal]|null} 成功则返回[SOL储备, token储备]，失败则返回null
     */
    static calculateReservesByPrice(price, k) {
        // 检查输入参数是否有效
        if (price.lte(0) || k.lte(0)) {
            return null;
        }

        // 最小价格判断，防溢出
        if (price.lt(this.INITIAL_MIN_PRICE_DECIMAL)) {
            return null;
        }

        // 根据AMM公式: k = sol_reserve * token_reserve
        // 且 price = sol_reserve / token_reserve
        // 可得: sol_reserve = price * token_reserve
        // 代入k公式: k = price * token_reserve^2
        // 因此: token_reserve = sqrt(k / price)
        // sol_reserve = sqrt(k * price)

        // 计算 k / price
        const kDivPrice = k.div(price);

        // 计算 token_reserve = sqrt(k / price)
        const tokenReserve = kDivPrice.sqrt();

        // 计算 sol_reserve = price * token_reserve
        const solReserve = price.mul(tokenReserve);

        if (tokenReserve.isNaN() || solReserve.isNaN()) {
            return null;
        }

        return [solReserve, tokenReserve];
    }

    /**
     * 基于起始价格和SOL输入量计算token输出量和结束价格
     * 
     * @param {bigint|string|number} startLowPrice - 开始价格
     * @param {bigint|string|number} solInputAmount - 买入用的SOL数量
     * @returns {[bigint, bigint]|null} 成功则返回[交易完成后的价格, 得到的token数量]，失败则返回null
     * 价格向下取整，token数量向下取整
     */
    static buyFromPriceWithSolInput(startLowPrice, solInputAmount) {
        // 转换为Decimal进行计算
        const startPriceDec = this.u128ToDecimal(startLowPrice);
        const solInputDec = this.u64ToSolDecimal(solInputAmount);

        // 检查输入参数是否有效
        if (startPriceDec.lte(0) || solInputDec.lte(0)) {
            return null;
        }

        // 使用初始k值
        const k = this.calculateInitialK();

        // 计算起始状态的储备量
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // 计算结束状态的SOL储备量
        const endSolReserve = startSolReserve.add(solInputDec);

        // 根据AMM公式计算结束状态的token储备量
        const endTokenReserve = k.div(endSolReserve);

        // 计算token输出量
        const tokenOutputAmount = startTokenReserve.sub(endTokenReserve);

        // 计算结束价格
        const endPrice = endSolReserve.div(endTokenReserve);

        // 检查计算结果是否有效
        if (tokenOutputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // 转换回相应类型，按要求取整
        const endPriceU128 = this.decimalToU128(endPrice); // 价格向下取整
        const tokenAmountU64 = this.tokenDecimalToU64(tokenOutputAmount); // token向下取整

        if (endPriceU128 === null || tokenAmountU64 === null) {
            return null;
        }

        return [endPriceU128, tokenAmountU64];
    }

    /**
     * 基于起始价格和token输入量计算SOL输出量和结束价格
     * 
     * @param {bigint|string|number} startHighPrice - 开始价格
     * @param {bigint|string|number} tokenInputAmount - 卖出的token数量
     * @returns {[bigint, bigint]|null} 成功则返回[交易完成后的价格, 得到的SOL数量]，失败则返回null
     * 价格向下取整，SOL数量向下取整
     */
    static sellFromPriceWithTokenInput(startHighPrice, tokenInputAmount) {
        // 转换为Decimal进行计算
        const startPriceDec = this.u128ToDecimal(startHighPrice);
        const tokenInputDec = this.u64ToTokenDecimal(tokenInputAmount);

        // 检查输入参数是否有效
        if (startPriceDec.lte(0) || tokenInputDec.lte(0)) {
            return null;
        }

        // 使用初始k值
        const k = this.calculateInitialK();

        // 计算起始状态的储备量
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // 计算结束状态的token储备量
        const endTokenReserve = startTokenReserve.add(tokenInputDec);

        // 根据AMM公式计算结束状态的SOL储备量
        const endSolReserve = k.div(endTokenReserve);

        // 计算SOL输出量
        const solOutputAmount = startSolReserve.sub(endSolReserve);

        // 计算结束价格
        const endPrice = endSolReserve.div(endTokenReserve);

        // 检查计算结果是否有效
        if (solOutputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // 转换回相应类型，按要求取整
        const endPriceU128 = this.decimalToU128(endPrice); // 价格向下取整
        const solAmountU64 = this.solDecimalToU64(solOutputAmount); // SOL向下取整

        if (endPriceU128 === null || solAmountU64 === null) {
            return null;
        }

        return [endPriceU128, solAmountU64];
    }

    /**
     * 基于起始价格和期望token输出量计算需要的SOL输入量和结束价格
     * 
     * @param {bigint|string|number} startLowPrice - 开始价格
     * @param {bigint|string|number} tokenOutputAmount - 希望得到的token数量
     * @returns {[bigint, bigint]|null} 成功则返回[交易完成后的价格, 需要付出的SOL数量]，失败则返回null
     * 价格向下取整，SOL数量向上取整
     */
    static buyFromPriceWithTokenOutput(startLowPrice, tokenOutputAmount) {
        // 转换为Decimal进行计算
        const startPriceDec = this.u128ToDecimal(startLowPrice);
        const tokenOutputDec = this.u64ToTokenDecimal(tokenOutputAmount);

        // 检查输入参数是否有效
        if (startPriceDec.lte(0) || tokenOutputDec.lte(0)) {
            return null;
        }

        // 使用初始k值
        const k = this.calculateInitialK();

        // 计算起始状态的储备量
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // 计算结束状态的token储备量
        const endTokenReserve = startTokenReserve.sub(tokenOutputDec);

        // 检查token储备量是否足够
        if (endTokenReserve.lte(0)) {
            return null;
        }

        // 根据AMM公式计算结束状态的SOL储备量
        const endSolReserve = k.div(endTokenReserve);

        // 计算需要的SOL输入量
        const solInputAmount = endSolReserve.sub(startSolReserve);

        // 计算结束价格
        const endPrice = endSolReserve.div(endTokenReserve);

        // 检查计算结果是否有效
        if (solInputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // 转换回相应类型，按要求取整
        const endPriceU128 = this.decimalToU128(endPrice); // 价格向下取整
        const solAmountU64 = this.solDecimalToU64Ceil(solInputAmount); // SOL向上取整

        if (endPriceU128 === null || solAmountU64 === null) {
            return null;
        }

        return [endPriceU128, solAmountU64];
    }

    /**
     * 基于起始价格和期望SOL输出量计算需要的token输入量和结束价格
     * 
     * @param {bigint|string|number} startHighPrice - 开始价格
     * @param {bigint|string|number} solOutputAmount - 希望得到的SOL数量
     * @returns {[bigint, bigint]|null} 成功则返回[交易完成后的价格, 需要付出的token数量]，失败则返回null
     * 价格向下取整，token数量向上取整
     */
    static sellFromPriceWithSolOutput(startHighPrice, solOutputAmount) {
        // 转换为Decimal进行计算
        const startPriceDec = this.u128ToDecimal(startHighPrice);
        const solOutputDec = this.u64ToSolDecimal(solOutputAmount);

        // 检查输入参数是否有效
        if (startPriceDec.lte(0) || solOutputDec.lte(0)) {
            return null;
        }

        // 使用初始k值
        const k = this.calculateInitialK();

        // 计算起始状态的储备量
        const startReserves = this.calculateReservesByPrice(startPriceDec, k);
        if (!startReserves) return null;

        const [startSolReserve, startTokenReserve] = startReserves;

        // 计算结束状态的SOL储备量
        const endSolReserve = startSolReserve.sub(solOutputDec);

        // 检查SOL储备量是否足够
        if (endSolReserve.lte(0)) {
            return null;
        }

        // 根据AMM公式计算结束状态的token储备量
        const endTokenReserve = k.div(endSolReserve);

        // 计算需要的token输入量
        const tokenInputAmount = endTokenReserve.sub(startTokenReserve);

        // 计算结束价格
        const endPrice = endSolReserve.div(endTokenReserve);

        // 检查计算结果是否有效
        if (tokenInputAmount.lte(0) || endPrice.lte(0)) {
            return null;
        }

        // 转换回相应类型，按要求取整
        const endPriceU128 = this.decimalToU128(endPrice); // 价格向下取整
        const tokenAmountU64 = this.tokenDecimalToU64Ceil(tokenInputAmount); // token向上取整

        if (endPriceU128 === null || tokenAmountU64 === null) {
            return null;
        }

        return [endPriceU128, tokenAmountU64];
    }

    /**
     * 计算扣除手续费后的剩余金额
     * 
     * @param {bigint|string|number} amount - 原始金额
     * @param {number} fee - 手续费率，以FEE_DENOMINATOR为分母表示
     *                       例如：1000表示1%的手续费 (1000/100000)
     *                             2000表示2%的手续费 (2000/100000)
     * @returns {bigint|null} 成功则返回扣除手续费后的剩余金额，失败则返回null
     * 手续费计算采用向下取整方式，即对用户最有利的计算方式
     */
    static calculateAmountAfterFee(amount, fee) {
        // 转换输入参数为BigInt
        try {
            const amountBigInt = BigInt(amount.toString());
            const feeBigInt = BigInt(fee);

            // 检查手续费率是否有效（必须小于等于10%）
            if (feeBigInt > MAX_FEE_RATE) {
                return null;
            }

            // 计算手续费金额：amount * fee / FEE_DENOMINATOR
            const feeAmount = (amountBigInt * feeBigInt) / FEE_DENOMINATOR;

            // 计算扣除手续费后的剩余金额
            const amountAfterFee = amountBigInt - feeAmount;

            return amountAfterFee;
        } catch (error) {
            return null;
        }
    }

    /**
     * 将u128价格转换为可读的小数字符串格式，用于显示
     * 
     * @param {bigint|string|number} price - 需要转换的u128价格
     * @param {number} decimalPlaces - 保留的小数位数，默认为28位
     * @returns {string} 格式化后的价格字符串
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
     * 创建价格的完整显示字符串，同时包含整数和小数格式
     * 
     * @param {bigint|string|number} price - 需要转换的u128价格
     * @param {number} decimalPlaces - 保留的小数位数，默认为28位
     * @returns {string} 格式化后的完整价格字符串，格式："整数价格 (小数价格)"
     */
    static createPriceDisplayString(price, decimalPlaces = 28) {
        const integerPrice = (typeof price === 'bigint') ? price.toString() : price.toString();
        const decimalPrice = this.formatPriceForDisplay(price, decimalPlaces);
        return `${integerPrice} (${decimalPrice})`;
    }

    /**
     * 根据流动池储备量计算价格（1 token 值多少 SOL）
     * 
     * @param {bigint|string|number|BN} lpTokenReserve - 流动池中的token储备量（u64格式，6位精度）
     * @param {bigint|string|number|BN} lpSolReserve - 流动池中的SOL储备量（u64格式，9位精度）
     * @returns {string|null} 成功则返回28位小数的价格字符串，失败则返回null
     */
    static calculatePoolPrice(lpTokenReserve, lpSolReserve) {
        try {
            // 处理BN对象，转换为字符串
            let tokenReserveStr = lpTokenReserve;
            let solReserveStr = lpSolReserve;
            
            // 如果是BN对象，使用toString()方法
            if (lpTokenReserve && typeof lpTokenReserve === 'object' && lpTokenReserve.toString) {
                tokenReserveStr = lpTokenReserve.toString();
            }
            if (lpSolReserve && typeof lpSolReserve === 'object' && lpSolReserve.toString) {
                solReserveStr = lpSolReserve.toString();
            }
            
            // 转换为Decimal进行计算
            const tokenReserveDec = this.u64ToTokenDecimal(tokenReserveStr);
            const solReserveDec = this.u64ToSolDecimal(solReserveStr);
            
            // 检查储备量是否有效
            if (tokenReserveDec.lte(0) || solReserveDec.lte(0)) {
                return null;
            }
            
            // 计算价格：1 token = SOL储备 / Token储备
            const price = solReserveDec.div(tokenReserveDec);
            
            // 返回28位小数的字符串
            return price.toFixed(28);
        } catch (error) {
            return null;
        }
    }
}

module.exports = CurveAMM;



