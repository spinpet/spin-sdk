

const { calcLiqTokenBuy, calcLiqTokenSell } = require('./calcLiq');

/**
 * Simulate token buy transaction - calculate if target token amount can be purchased
 * 模拟以 Token 数量为目标的买入交易 - 计算是否能买到指定数量的 Token
 * @param {string} mint - Token address 代币地址
 * @param {bigint|string|number} buyTokenAmount - Target token amount to buy 目标购买的 Token 数量
 * @param {string} passOrder - Optional order address to skip (won't be liquidated) 可选的跳过订单地址
 * @returns {Promise<Object>} Token buy simulation result 模拟结果
 */
async function simulateTokenBuy(mint, buyTokenAmount, passOrder = null) {
  // 获取价格和订单数据
  const price = await this.sdk.data.price(mint);
  const ordersResponse = await this.sdk.data.orders(mint, {
    type: 'up_orders',
    limit: this.sdk.MAX_ORDERS_COUNT + 1
  });

  // 提取实际的订单数组
  const orders = ordersResponse.data.orders;

  console.log('simulateTokenBuy 获取的数据:');
  console.log('价格:', price);
  console.log('订单数量:', orders.length);
  orders.forEach((order, i) => console.log(`订单${i}: start=${order.lock_lp_start_price}, end=${order.lock_lp_end_price}, sol=${order.lock_lp_sol_amount}, token=${order.lock_lp_token_amount}`));

  // 调用 calcLiqTokenBuy 进行流动性计算
  try {
    const liqResult = calcLiqTokenBuy(
      price,
      buyTokenAmount, 
      orders,
      this.sdk.MAX_ORDERS_COUNT,
      passOrder
    );

    console.log('\n=== calcLiqTokenBuy 返回结果 ===');
    console.log('自由流动性 SOL 总量:', liqResult.free_lp_sol_amount_sum.toString());
    console.log('自由流动性 Token 总量:', liqResult.free_lp_token_amount_sum.toString());
    console.log('锁定流动性 SOL 总量:', liqResult.lock_lp_sol_amount_sum.toString());
    console.log('锁定流动性 Token 总量:', liqResult.lock_lp_token_amount_sum.toString());
    console.log('是否包含无限流动性:', liqResult.has_infinite_lp);
    console.log('跳过的订单索引:', liqResult.pass_order_id);
    console.log('需要强平的订单数量:', liqResult.force_close_num);
    console.log('理想 SOL 使用量:', liqResult.ideal_lp_sol_amount.toString());
    console.log('实际 SOL 使用量:', liqResult.real_lp_sol_amount.toString());
    console.log('===============================\n');

    // Convert to BigInt for calculations
    const buyTokenAmountBig = BigInt(buyTokenAmount);
    const freeTokenAmount = BigInt(liqResult.free_lp_token_amount_sum);
    const realSolAmount = BigInt(liqResult.real_lp_sol_amount);
    const idealSolAmount = BigInt(liqResult.ideal_lp_sol_amount);

    // 1. Calculate completion percentage
    let completionPercentage;
    if (freeTokenAmount >= buyTokenAmountBig) {
      completionPercentage = "100.0";
    } else {
      const percentage = Math.floor((Number(freeTokenAmount) / Number(buyTokenAmountBig)) * 1000) / 10;
      completionPercentage = percentage.toFixed(1);
    }

    // 2. Calculate slippage percentage
    let slippagePercentage;
    let suggestedLiquidity;

    if (realSolAmount > 0n) {
      // Normal case: calculate slippage
      const diff = idealSolAmount > realSolAmount ? idealSolAmount - realSolAmount : realSolAmount - idealSolAmount;
      const slippage = Math.floor((Number(diff) / Number(idealSolAmount)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    } else {
      // Special case: real SOL amount is 0, need to recalculate with suggested liquidity
      const suggestedAmount = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      
      const recalcResult = calcLiqTokenBuy(
        price,
        suggestedAmount,
        orders,
        this.sdk.MAX_ORDERS_COUNT,
        passOrder
      );
      
      const recalcRealSol = BigInt(recalcResult.real_lp_sol_amount);
      const recalcIdealSol = BigInt(recalcResult.ideal_lp_sol_amount);
      
      if (recalcRealSol <= 0n) {
        throw new Error('Recalculated real SOL amount should be greater than 0');
      }
      
      const diff = recalcIdealSol > recalcRealSol ? recalcIdealSol - recalcRealSol : recalcRealSol - recalcIdealSol;
      const slippage = Math.floor((Number(diff) / Number(recalcIdealSol)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    }

    // 3. Calculate suggested liquidity
    if (completionPercentage === "100.0") {
      suggestedLiquidity = buyTokenAmountBig.toString();
    } else {
      const suggested = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      suggestedLiquidity = suggested.toString();
    }

    return {
      liqResult,
      completion: completionPercentage,
      slippage: slippagePercentage,
      suggestedAmount: suggestedLiquidity
    };
  } catch (error) {
    console.error('calcLiqTokenBuy 调用失败:', error.message);
    throw error;
  }
}


/**
 * Simulate sell transaction analysis
 * @param {string} mint - Token address
 * @param {bigint|string|number} sellTokenAmount - Token amount to sell (u64 format, precision 10^6)
 * @param {string} passOrder - Optional order address to skip (won't be liquidated) 可选的跳过订单地址
* @returns {Promise<Object>} Sell analysis result
 */
async function simulateTokenSell(mint, sellTokenAmount, passOrder = null) {
  // 获取价格和订单数据
  const price = await this.sdk.data.price(mint);
  const ordersResponse = await this.sdk.data.orders(mint, {
    type: 'down_orders',
    limit: this.sdk.MAX_ORDERS_COUNT + 1
  });

  // 提取实际的订单数组
  const orders = ordersResponse.data.orders;

  console.log('simulateTokenSell 获取的数据:');
  console.log('价格:', price);
  console.log('订单数量:', orders.length);
  orders.forEach((order, i) => console.log(`订单${i}: start=${order.lock_lp_start_price}, end=${order.lock_lp_end_price}, sol=${order.lock_lp_sol_amount}, token=${order.lock_lp_token_amount}`));

  // 调用 calcLiqTokenSell 进行流动性计算
  try {
    const liqResult = calcLiqTokenSell(
      price,
      sellTokenAmount,
      orders,
      this.sdk.MAX_ORDERS_COUNT,
      passOrder
    );

    console.log('\n=== calcLiqTokenSell 返回结果 ===');
    console.log('自由流动性 SOL 总量:', liqResult.free_lp_sol_amount_sum.toString());
    console.log('自由流动性 Token 总量:', liqResult.free_lp_token_amount_sum.toString());
    console.log('锁定流动性 SOL 总量:', liqResult.lock_lp_sol_amount_sum.toString());
    console.log('锁定流动性 Token 总量:', liqResult.lock_lp_token_amount_sum.toString());
    console.log('是否包含无限流动性:', liqResult.has_infinite_lp);
    console.log('跳过的订单索引:', liqResult.pass_order_id);
    console.log('需要强平的订单数量:', liqResult.force_close_num);
    console.log('理想 SOL 获得量:', liqResult.ideal_lp_sol_amount.toString());
    console.log('实际 SOL 获得量:', liqResult.real_lp_sol_amount.toString());
    console.log('===============================\n');

    // Convert to BigInt for calculations
    const sellTokenAmountBig = BigInt(sellTokenAmount);
    const freeTokenAmount = BigInt(liqResult.free_lp_token_amount_sum);
    const realSolAmount = BigInt(liqResult.real_lp_sol_amount);
    const idealSolAmount = BigInt(liqResult.ideal_lp_sol_amount);

    // 1. Calculate completion percentage
    let completionPercentage;
    if (freeTokenAmount >= sellTokenAmountBig) {
      completionPercentage = "100.0";
    } else {
      const percentage = Math.floor((Number(freeTokenAmount) / Number(sellTokenAmountBig)) * 1000) / 10;
      completionPercentage = percentage.toFixed(1);
    }

    // 2. Calculate slippage percentage
    let slippagePercentage;
    let suggestedLiquidity;

    if (realSolAmount > 0n) {
      // Normal case: calculate slippage
      const diff = idealSolAmount > realSolAmount ? idealSolAmount - realSolAmount : realSolAmount - idealSolAmount;
      const slippage = Math.floor((Number(diff) / Number(idealSolAmount)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    } else {
      // Special case: real SOL amount is 0, need to recalculate with suggested liquidity
      const suggestedAmount = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      
      const recalcResult = calcLiqTokenSell(
        price,
        suggestedAmount,
        orders,
        this.sdk.MAX_ORDERS_COUNT,
        passOrder
      );
      
      const recalcRealSol = BigInt(recalcResult.real_lp_sol_amount);
      const recalcIdealSol = BigInt(recalcResult.ideal_lp_sol_amount);
      
      if (recalcRealSol <= 0n) {
        throw new Error('Recalculated real SOL amount should be greater than 0');
      }
      
      const diff = recalcIdealSol > recalcRealSol ? recalcIdealSol - recalcRealSol : recalcRealSol - recalcIdealSol;
      const slippage = Math.floor((Number(diff) / Number(recalcIdealSol)) * 1000) / 10;
      slippagePercentage = slippage.toFixed(1);
    }

    // 3. Calculate suggested liquidity
    if (completionPercentage === "100.0") {
      suggestedLiquidity = sellTokenAmountBig.toString();
    } else {
      const suggested = (freeTokenAmount * BigInt(this.sdk.SUGGEST_LIQ_RATIO)) / 1000n;
      suggestedLiquidity = suggested.toString();
    }

    return {
      liqResult,
      completion: completionPercentage,
      slippage: slippagePercentage,
      suggestedAmount: suggestedLiquidity
    };
  } catch (error) {
    console.error('calcLiqTokenSell 调用失败:', error.message);
    throw error;
  }
}



module.exports = {
    simulateTokenBuy,
    simulateTokenSell
};

