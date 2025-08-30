
const CurveAMM = require('../../utils/curve_amm');


/**
 * 计算代币买入时的流动性影响 Calculate liquidity impact for token buy operations
 * @param {bigint|string|number} price - 当前代币价格 Current token price
 * @param {bigint|string|number} buyTokenAmount - 购买的代币数量 Amount of tokens to buy
 * @param {Array<Object>} orders - 订单数组，每个订单包含以下字段 Array of order objects with following fields:
 *   - order_type: {number} 订单类型(1=做多,2=做空) Order type (1=long, 2=short)
 *   - mint: {string} 代币地址 Token mint address
 *   - user: {string} 用户地址 User address
 *   - lock_lp_start_price: {string} LP锁定开始价格 LP lock start price
 *   - lock_lp_end_price: {string} LP锁定结束价格 LP lock end price
 *   - lock_lp_sol_amount: {number} 锁定的SOL数量 Locked SOL amount
 *   - lock_lp_token_amount: {number} 锁定的代币数量 Locked token amount
 *   - start_time: {number} 开始时间戳 Start timestamp
 *   - end_time: {number} 结束时间戳 End timestamp
 *   - margin_sol_amount: {number} 保证金SOL数量 Margin SOL amount
 *   - borrow_amount: {number} 借贷数量 Borrow amount
 *   - position_asset_amount: {number} 持仓资产数量 Position asset amount
 *   - borrow_fee: {number} 借贷费用 Borrow fee
 *   - order_pda: {string} 订单PDA地址 Order PDA address  
 * @param {number} onceMaxOrder - 一次处理的最大订单数 Maximum orders to process at once
 * @param {Object|null} passOrder - 传递的订单对象 Pass order object (optional)
 * @returns {Object} 返回流动性计算结果 Returns liquidity calculation result
 *   - free_lp_sol_amount_sum: {bigint} 自由流动性SOL总量 Free liquidity SOL sum
 *   - free_lp_token_amount_sum: {bigint} 自由流动性Token总量 Free liquidity token sum  
 *   - lock_lp_sol_amount_sum: {bigint} 锁定流动性SOL总量 Locked liquidity SOL sum
 *   - lock_lp_token_amount_sum: {bigint} 锁定流动性Token总量 Locked liquidity token sum
 *   - has_infinite_lp: {boolean} 是否包含无限流动性 Whether includes infinite liquidity
 */
function calcLiqTokenBuy(price, buyTokenAmount, orders, onceMaxOrder, passOrder = null) {
  // 由于是买入操作 肯定拿的是 up_orders 方向的 订单  lock_lp_start_price <  lock_lp_end_price
  // 并且 lock_lp_start_price 在 orders 中是从小到大排序的

  const result = {
    free_lp_sol_amount_sum: 0n,  // 间隙中可使用的sol流动性数量
    free_lp_token_amount_sum: 0n, // 间隙中可使用的token流动性数量
    lock_lp_sol_amount_sum: 0n,
    lock_lp_token_amount_sum: 0n,
    has_infinite_lp: false,
    force_close_num: 0, // 强平订单数量
    ideal_lp_sol_amount: 0n, // 理想情况下买到buyTokenAmount的数量, 理想情况下使用的SOL数量
    real_lp_sol_amount: 0n, // 要买到buyTokenAmount的数量, 实际使用的SOL数量
  }
  let buyTokenAmountBigInt = BigInt(buyTokenAmount);

  //result.ideal_lp_token_amount_sum = buyTokenAmountBigInt;

  [_, result.ideal_lp_sol_amount] = CurveAMM.buyFromPriceWithTokenOutput(BigInt(price), buyTokenAmountBigInt);

  // 选择较小值进行遍历
  const loopCount = Math.min(orders.length, onceMaxOrder);
  console.log(`遍历订单数量: ${loopCount}`);

  let counti = 0;
  for (let i = 0; i < loopCount; i++) {
    const order = orders[i];

    console.log(`\n处理订单 ${i}:`, order.order_pda);


    // 计算间隙流动性
    let startPrice, endPrice;
    if (i === 0) {
      // 第一个订单：使用当前价格到订单开始价格的间隙
      startPrice = BigInt(price);
      endPrice = BigInt(order.lock_lp_start_price);
    } else {
      // 后续订单：使用前一个订单结束价格到当前订单开始价格的间隙
      startPrice = BigInt(orders[i - 1].lock_lp_end_price);
      endPrice = BigInt(order.lock_lp_start_price);
    }

    console.log(`计算间隙流动性 - 从价格 ${startPrice} 到 ${endPrice}`);

    // 如果存在价格间隙，计算自由流动性
    if (endPrice > startPrice) {
      try {
        const gapLiquidity = CurveAMM.buyFromPriceToPrice(startPrice, endPrice);
        if (gapLiquidity && Array.isArray(gapLiquidity) && gapLiquidity.length === 2) {
          const [solAmount, tokenAmount] = gapLiquidity;
          prve_free_lp_sol_amount_sum = result.free_lp_sol_amount_sum; // 上次的值
          result.free_lp_sol_amount_sum += BigInt(solAmount);
          result.free_lp_token_amount_sum += BigInt(tokenAmount);

          // 计算实际使用的SOL数量 到能买到为止
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum > buyTokenAmountBigInt) {
              // 这时间隙流动性已经够买入的了
              // 计算最后精确需要买多少token
              const lastFreeToken = result.free_lp_token_amount_sum - buyTokenAmountBigInt;
              const [_, lastFreeSol] = CurveAMM.buyFromPriceWithTokenOutput(startPrice, lastFreeToken)
              result.real_lp_sol_amount += prve_free_lp_sol_amount_sum + BigInt(lastFreeSol);
              result.force_close_num = counti; // 强平订单数量
              console.log(`间隙流动性已满足买入需求，实际使用SOL: ${result.real_lp_sol_amount}, 标记`);

            }
          }

          console.log(`间隙流动性计算结果 - SOL: ${solAmount}, Token: ${tokenAmount}`);
        } else {
          console.log(`间隙流动性计算返回null或格式错误`);
        }
      } catch (error) {
        console.log(`间隙流动性计算错误: ${error}`, error);
      }
    } else {
      console.log(`无价格间隙（endPrice <= startPrice）`);
    }

    // 累加锁定的流动性
    result.lock_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
    result.lock_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);
    counti += 1;
    console.log(`订单 ${i} 锁定流动性 - SOL: ${order.lock_lp_sol_amount}, Token: ${order.lock_lp_token_amount}`);


    console.log(`当前累计结果:`, {
      free_lp_sol_amount_sum: result.free_lp_sol_amount_sum.toString(),
      free_lp_token_amount_sum: result.free_lp_token_amount_sum.toString(),
      lock_lp_sol_amount_sum: result.lock_lp_sol_amount_sum.toString(),
      lock_lp_token_amount_sum: result.lock_lp_token_amount_sum.toString(),
      has_infinite_lp: result.has_infinite_lp,
      force_close_num: result.force_close_num,
      real_lp_sol_amount: result.real_lp_sol_amount, // 要买到buyTokenAmount的数量, 实际使用的SOL数量
    });
  }

  // 如果遍历的订单数小于等于onceMaxOrder，说明链表结束，需要计算无限流动性
  if (orders.length <= onceMaxOrder && orders.length > 0) {
    console.log('\n计算无限流动性（链表已结束）');

    const lastOrder = orders[orders.length - 1];
    const lastEndPrice = BigInt(lastOrder.lock_lp_end_price);
    const maxPrice = CurveAMM.MAX_U128_PRICE;

    console.log(`最后一个订单结束价格: ${lastEndPrice}`);
    console.log(`最大价格: ${maxPrice}`);

    if (maxPrice > lastEndPrice) {
      try {
        const infiniteLiquidity = CurveAMM.buyFromPriceToPrice(lastEndPrice, maxPrice);
        if (infiniteLiquidity && Array.isArray(infiniteLiquidity) && infiniteLiquidity.length === 2) {
          const [solAmount, tokenAmount] = infiniteLiquidity;
          result.free_lp_sol_amount_sum += BigInt(solAmount);
          result.free_lp_token_amount_sum += BigInt(tokenAmount);
          result.has_infinite_lp = true;


          // 进入无限流动性后 也要 , 计算实际使用的SOL数量 到能买到为止
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum > buyTokenAmountBigInt) {
              // 这时间隙流动性已经够买入的了
              // 计算最后精确需要买多少token
              const lastFreeToken = result.free_lp_token_amount_sum - buyTokenAmountBigInt;
              const [_, lastFreeSol] = CurveAMM.buyFromPriceWithTokenOutput(lastEndPrice, lastFreeToken)
              result.real_lp_sol_amount += BigInt(lastFreeSol);
              result.force_close_num = counti; // 强平订单数量
              console.log(`无限流动性才满足买入需求，实际使用SOL: ${result.real_lp_sol_amount}, 标记`);
            }
          }


          console.log(`无限流动性计算结果 - SOL: ${solAmount}, Token: ${tokenAmount}`);
          console.log(`最终累计结果:`, {
            free_lp_sol_amount_sum: result.free_lp_sol_amount_sum.toString(),
            free_lp_token_amount_sum: result.free_lp_token_amount_sum.toString(),
            lock_lp_sol_amount_sum: result.lock_lp_sol_amount_sum.toString(),
            lock_lp_token_amount_sum: result.lock_lp_token_amount_sum.toString(),
            has_infinite_lp: result.has_infinite_lp
          });
        } else {
          console.log(`无限流动性计算返回null或格式错误`);
        }
      } catch (error) {
        console.log(`无限流动性计算错误: ${error.message}`);
      }
    }
  }

  return result;

}




/**
 * 计算代币卖出时的流动性影响 Calculate liquidity impact for token sell operations
 * @param {bigint|string|number} price - 当前代币价格 Current token price
 * @param {bigint|string|number} sellTokenAmount - 卖出的代币数量 Amount of tokens to sell
 * @param {Array<Object>} orders - 订单数组，每个订单包含以下字段 Array of order objects with following fields:
 *   - order_type: {number} 订单类型(1=做多,2=做空) Order type (1=long, 2=short)
 *   - mint: {string} 代币地址 Token mint address
 *   - user: {string} 用户地址 User address
 *   - lock_lp_start_price: {string} LP锁定开始价格 LP lock start price
 *   - lock_lp_end_price: {string} LP锁定结束价格 LP lock end price
 *   - lock_lp_sol_amount: {number} 锁定的SOL数量 Locked SOL amount
 *   - lock_lp_token_amount: {number} 锁定的代币数量 Locked token amount
 *   - start_time: {number} 开始时间戳 Start timestamp
 *   - end_time: {number} 结束时间戳 End timestamp
 *   - margin_sol_amount: {number} 保证金SOL数量 Margin SOL amount
 *   - borrow_amount: {number} 借贷数量 Borrow amount
 *   - position_asset_amount: {number} 持仓资产数量 Position asset amount
 *   - borrow_fee: {number} 借贷费用 Borrow fee
 *   - order_pda: {string} 订单PDA地址 Order PDA address
 * @param {number} onceMaxOrder - 一次处理的最大订单数 Maximum orders to process at once
 * @param {Object|null} passOrder - 传递的订单对象 Pass order object (optional)
 * @returns {Object} 返回流动性计算结果 Returns liquidity calculation result
 *   - free_lp_sol_amount_sum: {bigint} 自由流动性SOL总量 Free liquidity SOL sum
 *   - free_lp_token_amount_sum: {bigint} 自由流动性Token总量 Free liquidity token sum  
 *   - lock_lp_sol_amount_sum: {bigint} 锁定流动性SOL总量 Locked liquidity SOL sum
 *   - lock_lp_token_amount_sum: {bigint} 锁定流动性Token总量 Locked liquidity token sum
 *   - has_infinite_lp: {boolean} 是否包含无限流动性 Whether includes infinite liquidity
 */
function calcLiqTokenSell(price, sellTokenAmount, orders, onceMaxOrder, passOrder = null) {



}

module.exports = {
  calcLiqTokenBuy,
  calcLiqTokenSell
};


