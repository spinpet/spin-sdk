

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
  //console.log('订单数据:', orders);

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

    return liqResult;
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
  //console.log('订单数据:', orders);

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

    return liqResult;
  } catch (error) {
    console.error('calcLiqTokenSell 调用失败:', error.message);
    throw error;
  }
}



module.exports = {
    simulateTokenBuy,
    simulateTokenSell
};

