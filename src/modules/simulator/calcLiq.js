
const CurveAMM = require('../../utils/curve_amm');


/**
 * 计算代币买入时的流动性影响 Calculate liquidity impact for token buy operations
 * 
 * 此函数分析买入操作对价格区间内流动性的影响，计算可用的自由流动性、锁定流动性，
 * 并支持跳过指定订单（将其流动性视为可用）。适用于做多订单（up_orders）场景。
 * This function analyzes the liquidity impact of buy operations within price ranges,
 * calculates available free liquidity, locked liquidity, and supports skipping specific
 * orders (treating their liquidity as available). Applicable for long orders (up_orders) scenarios.
 * 
 * @param {bigint|string|number} price - 当前代币价格，作为计算起始价格 Current token price, used as calculation start price
 * @param {bigint|string|number} buyTokenAmount - 购买的代币数量，目标买入数量 Amount of tokens to buy, target purchase amount
 * @param {Array<Object>} orders - 订单数组，按 lock_lp_start_price 从小到大排序 Array of orders sorted by lock_lp_start_price (ascending):
 *   - order_type: {number} 订单类型(1=做多,2=做空) Order type (1=long, 2=short)
 *   - mint: {string} 代币地址 Token mint address
 *   - user: {string} 用户地址 User address
 *   - lock_lp_start_price: {string} LP锁定开始价格 LP lock start price (required)
 *   - lock_lp_end_price: {string} LP锁定结束价格 LP lock end price (required)
 *   - lock_lp_sol_amount: {number} 锁定的SOL数量 Locked SOL amount (required)
 *   - lock_lp_token_amount: {number} 锁定的代币数量 Locked token amount (required)
 *   - start_time: {number} 开始时间戳 Start timestamp
 *   - end_time: {number} 结束时间戳 End timestamp
 *   - margin_sol_amount: {number} 保证金SOL数量 Margin SOL amount
 *   - borrow_amount: {number} 借贷数量 Borrow amount
 *   - position_asset_amount: {number} 持仓资产数量 Position asset amount
 *   - borrow_fee: {number} 借贷费用 Borrow fee
 *   - order_pda: {string} 订单PDA地址 Order PDA address (required for passOrder matching)
 * @param {number} onceMaxOrder - 一次处理的最大订单数，限制遍历范围 Maximum orders to process at once, limits traversal range
 * @param {string|null} passOrder - 需要跳过的订单PDA地址字符串，当该值与订单的order_pda匹配时，跳过该订单并将其流动性计入自由流动性 Order PDA address string to skip, when this value matches an order's order_pda, skip that order and count its liquidity as free liquidity
 * 
 * @returns {Object} 流动性计算结果对象，包含详细的流动性分析数据 Liquidity calculation result object with detailed liquidity analysis data:
 * 
 *   **自由流动性 Free Liquidity:**
 *   - free_lp_sol_amount_sum: {bigint} 可用自由流动性SOL总量，包含以下来源：1)价格间隙流动性 2)跳过订单的流动性 3)无限流动性（如有）
 *                                       Total available free liquidity SOL amount, includes: 1) price gap liquidity 2) skipped order liquidity 3) infinite liquidity (if any)
 *   - free_lp_token_amount_sum: {bigint} 可用自由流动性Token总量，与SOL对应，表示在不强平任何订单情况下可买到的最大代币数量
 *                                         Total available free liquidity token amount, corresponds to SOL, represents max tokens buyable without force closing any orders
 * 
 *   **锁定流动性 Locked Liquidity:**
 *   - lock_lp_sol_amount_sum: {bigint} 被锁定的流动性SOL总量，不包括跳过的订单，这部分流动性不可直接使用
 *                                       Total locked liquidity SOL amount, excludes skipped orders, this liquidity is not directly usable
 *   - lock_lp_token_amount_sum: {bigint} 被锁定的流动性Token总量，不包括跳过的订单，对应于锁定的SOL流动性
 *                                         Total locked liquidity token amount, excludes skipped orders, corresponds to locked SOL liquidity
 * 
 *   **流动性状态标识 Liquidity Status Indicators:**
 *   - has_infinite_lp: {boolean} 是否包含无限流动性，true表示订单链表已结束且计算了到最大价格(MAX_U128_PRICE)的流动性
 *                                  Whether includes infinite liquidity, true means order chain ended and liquidity to max price (MAX_U128_PRICE) was calculated
 *   - pass_order_id: {number} 被跳过的订单在数组中的索引位置，-1表示没有跳过任何订单，>=0表示跳过了对应索引的订单
 *                               Index of skipped order in array, -1 means no order skipped, >=0 means order at that index was skipped
 * 
 *   **买入执行信息 Buy Execution Info:**
 *   - force_close_num: {number} 需要强平的订单数量，表示为了买到目标数量需要强制平仓多少个订单，0表示无需强平
 *                                 Number of orders that need to be force closed, indicates how many orders need force closure to buy target amount, 0 means no force closure needed
 *   - ideal_lp_sol_amount: {bigint} 理想SOL使用量，基于当前价格使用CurveAMM直接计算的理论最小SOL需求，不考虑流动性分布
 *                                     Ideal SOL usage, theoretical minimum SOL requirement calculated directly from current price using CurveAMM, ignores liquidity distribution
 *   - real_lp_sol_amount: {bigint} 实际SOL使用量，考虑真实流动性分布的精确SOL需求。0表示当前自由流动性不足以满足买入需求，需要强平更多订单
 *                                    Actual SOL usage, precise SOL requirement considering real liquidity distribution. 0 means current free liquidity insufficient for buy requirement, need to force close more orders
 * 
 * @throws {Error} 参数验证错误：price、buyTokenAmount、orders、onceMaxOrder 参数无效 Parameter validation error: invalid price, buyTokenAmount, orders, or onceMaxOrder
 * @throws {Error} 价格转换错误：无法将价格参数转换为 BigInt Price conversion error: cannot convert price parameters to BigInt
 * @throws {Error} 流动性计算错误：CurveAMM 计算失败或数值转换错误 Liquidity calculation error: CurveAMM calculation failure or value conversion error
 * @throws {Error} 间隙流动性计算失败：价格间隙流动性计算异常 Gap liquidity calculation failure: price gap liquidity calculation exception
 * @throws {Error} 无限流动性计算失败：最大价格流动性计算异常 Infinite liquidity calculation failure: max price liquidity calculation exception
 * @throws {Error} 订单数据格式错误：订单对象缺少必需字段 Order data format error: order object missing required fields
 */
function calcLiqTokenBuy(price, buyTokenAmount, orders, onceMaxOrder, passOrder = null) {
  // 由于是买入操作 肯定拿的是 up_orders 方向的 订单  lock_lp_start_price <  lock_lp_end_price
  // 并且 lock_lp_start_price 在 orders 中是从小到大排序的

  // 参数验证
  if (!price && price !== 0) {
    throw new Error('参数验证错误：price 参数不能为空 Parameter validation error: price cannot be null');
  }
  if (!buyTokenAmount && buyTokenAmount !== 0) {
    throw new Error('参数验证错误：buyTokenAmount 参数不能为空 Parameter validation error: buyTokenAmount cannot be null');
  }
  if (!Array.isArray(orders)) {
    throw new Error('参数验证错误：orders 必须是数组 Parameter validation error: orders must be an array');
  }
  if (!onceMaxOrder || onceMaxOrder <= 0) {
    throw new Error('参数验证错误：onceMaxOrder 必须是正数 Parameter validation error: onceMaxOrder must be a positive number');
  }

  const result = {
    free_lp_sol_amount_sum: 0n,  // 间隙中可使用的sol流动性数量
    free_lp_token_amount_sum: 0n, // 间隙中可使用的token流动性数量
    lock_lp_sol_amount_sum: 0n,
    lock_lp_token_amount_sum: 0n,
    has_infinite_lp: false, // 是否包含无限流动性
    pass_order_id: -1, // 跳过的订单索引
    force_close_num: 0, // 强平订单数量
    ideal_lp_sol_amount: 0n, // 理想情况下买到buyTokenAmount的数量, 理想情况下使用的SOL数量
    real_lp_sol_amount: 0n, // 要买到buyTokenAmount的数量, 实际使用的SOL数量
  }



  let buyTokenAmountBigInt;
  try {
    buyTokenAmountBigInt = BigInt(buyTokenAmount);
  } catch (error) {
    throw new Error(`价格转换错误：无法将 buyTokenAmount 转换为 BigInt Price conversion error: Cannot convert buyTokenAmount to BigInt - ${error.message}`);
  }

  //result.ideal_lp_token_amount_sum = buyTokenAmountBigInt;

  try {
    const priceBigInt = BigInt(price);
    [_, result.ideal_lp_sol_amount] = CurveAMM.buyFromPriceWithTokenOutput(priceBigInt, buyTokenAmountBigInt);
    //console.log(`理想计算: 当前价格=${priceBigInt}, 目标代币=${buyTokenAmountBigInt}, 理想SOL=${result.ideal_lp_sol_amount}`);
  } catch (error) {
    //console.log(`理想计算失败: 当前价格=${price}, 目标代币=${buyTokenAmountBigInt}`);
    console.log('错误详情:', error);
    throw new Error(`流动性计算错误：理想流动性计算失败 Liquidity calculation error: Ideal liquidity calculation failed - ${error.message}`);
  }

  // 选择较小值进行遍历
  const loopCount = Math.min(orders.length, onceMaxOrder);

  let counti = 0;
  for (let i = 0; i < loopCount; i++) {
    const order = orders[i];

    // 验证订单数据格式
    if (!order) {
      throw new Error(`订单数据格式错误：订单 ${i} 为空 Order data format error: Order ${i} is null`);
    }
    if (!order.lock_lp_start_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_start_price Order data format error: Order ${i} missing lock_lp_start_price`);
    }
    if (!order.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_end_price Order data format error: Order ${i} missing lock_lp_end_price`);
    }


    // 计算间隙流动性
    let startPrice, endPrice;
    try {
      if (i === 0) {
        // 第一个订单：使用当前价格到订单开始价格的间隙
        startPrice = BigInt(price);
        endPrice = BigInt(order.lock_lp_start_price);
      } else {
        // 后续订单：使用前一个订单结束价格到当前订单开始价格的间隙
        startPrice = BigInt(orders[i - 1].lock_lp_end_price);
        endPrice = BigInt(order.lock_lp_start_price);
      }
    } catch (error) {
      throw new Error(`价格转换错误：无法转换订单 ${i} 的价格数据 Price conversion error: Cannot convert price data for order ${i} - ${error.message}`);
    }


    // 如果存在价格间隙，计算自由流动性
    if (endPrice > startPrice) {
      try {
        const gapLiquidity = CurveAMM.buyFromPriceToPrice(startPrice, endPrice);
        if (gapLiquidity && Array.isArray(gapLiquidity) && gapLiquidity.length === 2) {
          const [solAmount, tokenAmount] = gapLiquidity;

          try {
            prve_free_lp_sol_amount_sum = result.free_lp_sol_amount_sum; // 上次的值
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            //console.log(`间隙[${i}]: ${startPrice}→${endPrice}, 间隙SOL=${solAmount}, 间隙Token=${tokenAmount}, 累计自由Token=${result.free_lp_token_amount_sum}`);
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换间隙流动性数值 Liquidity calculation error: Cannot convert gap liquidity values - ${error.message}`);
          }


          // 计算实际使用的SOL数量 到能买到为止
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum > buyTokenAmountBigInt) {
              // 这时间隙流动性已经够买入的了
              // 计算最后精确需要买多少token
              try {
                const actualBuyAmount = buyTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                //console.log("actualBuyAmount",actualBuyAmount)
                const [_, preciseSol] = CurveAMM.buyFromPriceWithTokenOutput(startPrice, actualBuyAmount)
                result.real_lp_sol_amount = prve_free_lp_sol_amount_sum + BigInt(preciseSol);

                //console.log(`实际计算[${i}]: 自由流动性已足够, actualBuyAmount=${actualBuyAmount}, preciseSol=${preciseSol}, 实际SOL=${result.real_lp_sol_amount}`);
                result.force_close_num = counti; // 强平订单数量
              } catch (error) {
                console.log('错误详情:', error);
                throw new Error(`流动性计算错误：精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`间隙流动性计算失败：返回数据格式错误 Gap liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('间隙流动性计算失败') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`间隙流动性计算失败：${error.message} Gap liquidity calculation failure: ${error.message}`);
      }
    } else {
    }

    // 检查是否需要跳过该订单（passOrder 逻辑）
    //const shouldSkipOrder = passOrder && typeof passOrder === 'string' && order.order_pda === passOrder;


    if (passOrder == order.order_pda) {

      // 将跳过订单的流动性加到自由流动性中
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Skipped order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_token_amount Order data format error: Skipped order ${i} missing lock_lp_token_amount`);
        }

        const prevFreeSolSum = result.free_lp_sol_amount_sum; // 保存之前的值用于计算
        result.free_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.free_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);

        result.pass_order_id = i;


        // 检查跳过订单后的自由流动性是否已满足买入需求
        if (result.real_lp_sol_amount === 0n) {
          if (result.free_lp_token_amount_sum >= buyTokenAmountBigInt) {
            // 自由流动性已经够买入需求了
            try {
              //const remainingToken = result.free_lp_token_amount_sum - buyTokenAmountBigInt;
              // 从当前价格开始计算需要多少SOL来买到精确的token数量
              const targetPrice = i === 0 ? BigInt(price) : BigInt(orders[i - 1].lock_lp_end_price);
              const actualBuyAmount = buyTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(order.lock_lp_token_amount));
              const [_, preciseSol] = CurveAMM.buyFromPriceWithTokenOutput(targetPrice, actualBuyAmount);
              result.real_lp_sol_amount = prevFreeSolSum + BigInt(preciseSol);
              //console.log(`实际计算[${i}]: 跳过订单后足够, targetPrice=${targetPrice}, preciseSol=${preciseSol}, 实际SOL=${result.real_lp_sol_amount}`);
              result.force_close_num = counti;
            } catch (error) {
              throw new Error(`流动性计算错误：跳过订单后精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed after skipping order - ${error.message}`);
            }
          }
        }

      } catch (error) {
        if (error.message.includes('订单数据格式错误') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法处理跳过订单 ${i} 的流动性 Liquidity calculation error: Cannot process skipped order ${i} liquidity - ${error.message}`);
      }
    } else {
      // 累加锁定的流动性（正常情况）
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_token_amount Order data format error: Order ${i} missing lock_lp_token_amount`);
        }

        result.lock_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.lock_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);
      } catch (error) {
        if (error.message.includes('订单数据格式错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法累加订单 ${i} 的锁定流动性 Liquidity calculation error: Cannot accumulate locked liquidity for order ${i} - ${error.message}`);
      }

      counti += 1;
    }




  }

  // 如果遍历的订单数小于等于onceMaxOrder，说明链表结束，需要计算无限流动性
  if (orders.length <= onceMaxOrder && orders.length > 0) {

    const lastOrder = orders[orders.length - 1];
    if (!lastOrder || !lastOrder.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：最后一个订单缺少 lock_lp_end_price Order data format error: Last order missing lock_lp_end_price`);
    }

    let lastEndPrice, maxPrice;
    try {
      lastEndPrice = BigInt(lastOrder.lock_lp_end_price);
      maxPrice = CurveAMM.MAX_U128_PRICE;
    } catch (error) {
      throw new Error(`价格转换错误：无法转换最后订单价格或最大价格 Price conversion error: Cannot convert last order price or max price - ${error.message}`);
    }


    if (maxPrice > lastEndPrice) {
      try {
        const infiniteLiquidity = CurveAMM.buyFromPriceToPrice(lastEndPrice, maxPrice);
        if (infiniteLiquidity && Array.isArray(infiniteLiquidity) && infiniteLiquidity.length === 2) {
          const [solAmount, tokenAmount] = infiniteLiquidity;

          try {
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            result.has_infinite_lp = true;
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换无限流动性数值 Liquidity calculation error: Cannot convert infinite liquidity values - ${error.message}`);
          }

          // 进入无限流动性后 也要 , 计算实际使用的SOL数量 到能买到为止
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum > buyTokenAmountBigInt) {
              // 这时间隙流动性已经够买入的了
              // 计算最后精确需要买多少token
              try {
                const actualBuyAmount = buyTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                const [_, preciseSol] = CurveAMM.buyFromPriceWithTokenOutput(lastEndPrice, actualBuyAmount)
                result.real_lp_sol_amount += BigInt(preciseSol);
                result.force_close_num = counti; // 强平订单数量
              } catch (error) {
                throw new Error(`流动性计算错误：无限流动性精确SOL计算失败 Liquidity calculation error: Infinite liquidity precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`无限流动性计算失败：返回数据格式错误 Infinite liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('无限流动性计算失败') || error.message.includes('流动性计算错误') || error.message.includes('订单数据格式错误') || error.message.includes('价格转换错误')) {
          throw error;
        }
        throw new Error(`无限流动性计算失败：${error.message} Infinite liquidity calculation failure: ${error.message}`);
      }
    }
  }

  return result;

}




/**
 * 计算代币卖出时的流动性影响 Calculate liquidity impact for token sell operations
 * 
 * 此函数分析卖出操作对价格区间内流动性的影响，计算可用的自由流动性、锁定流动性，
 * 并支持跳过指定订单（将其流动性视为可用）。适用于做空订单（down_orders）场景。
 * This function analyzes the liquidity impact of sell operations within price ranges,
 * calculates available free liquidity, locked liquidity, and supports skipping specific
 * orders (treating their liquidity as available). Applicable for short orders (down_orders) scenarios.
 * 
 * @param {bigint|string|number} price - 当前代币价格，作为计算起始价格 Current token price, used as calculation start price
 * @param {bigint|string|number} sellTokenAmount - 卖出的代币数量，目标卖出数量 Amount of tokens to sell, target sell amount
 * @param {Array<Object>} orders - 订单数组，按 lock_lp_start_price 从大到小排序 Array of orders sorted by lock_lp_start_price (descending):
 *   - order_type: {number} 订单类型(1=做多,2=做空) Order type (1=long, 2=short)
 *   - mint: {string} 代币地址 Token mint address
 *   - user: {string} 用户地址 User address
 *   - lock_lp_start_price: {string} LP锁定开始价格（高价） LP lock start price (high price) (required)
 *   - lock_lp_end_price: {string} LP锁定结束价格（低价） LP lock end price (low price) (required)
 *   - lock_lp_sol_amount: {number} 锁定的SOL数量 Locked SOL amount (required)
 *   - lock_lp_token_amount: {number} 锁定的代币数量 Locked token amount (required)
 *   - start_time: {number} 开始时间戳 Start timestamp
 *   - end_time: {number} 结束时间戳 End timestamp
 *   - margin_sol_amount: {number} 保证金SOL数量 Margin SOL amount
 *   - borrow_amount: {number} 借贷数量 Borrow amount
 *   - position_asset_amount: {number} 持仓资产数量 Position asset amount
 *   - borrow_fee: {number} 借贷费用 Borrow fee
 *   - order_pda: {string} 订单PDA地址 Order PDA address (required for passOrder matching)
 * @param {number} onceMaxOrder - 一次处理的最大订单数，限制遍历范围 Maximum orders to process at once, limits traversal range
 * @param {string|null} passOrder - 需要跳过的订单PDA地址字符串，当该值与订单的order_pda匹配时，跳过该订单并将其流动性计入自由流动性 Order PDA address string to skip, when this value matches an order's order_pda, skip that order and count its liquidity as free liquidity
 * 
 * @returns {Object} 流动性计算结果对象，包含详细的流动性分析数据 Liquidity calculation result object with detailed liquidity analysis data:
 * 
 *   **自由流动性 Free Liquidity:**
 *   - free_lp_sol_amount_sum: {bigint} 可用自由流动性SOL总量，表示卖出时能获得的SOL，包含：1)价格间隙流动性 2)跳过订单的流动性 3)无限流动性（如有）
 *                                       Total available free liquidity SOL amount, represents SOL obtainable from selling, includes: 1) price gap liquidity 2) skipped order liquidity 3) infinite liquidity (if any)
 *   - free_lp_token_amount_sum: {bigint} 可用自由流动性Token总量，表示在不强平任何订单情况下可卖出的最大代币数量
 *                                         Total available free liquidity token amount, represents max tokens sellable without force closing any orders
 * 
 *   **锁定流动性 Locked Liquidity:**
 *   - lock_lp_sol_amount_sum: {bigint} 被锁定的流动性SOL总量，不包括跳过的订单，这部分流动性不可直接使用
 *                                       Total locked liquidity SOL amount, excludes skipped orders, this liquidity is not directly usable
 *   - lock_lp_token_amount_sum: {bigint} 被锁定的流动性Token总量，不包括跳过的订单，对应于锁定的SOL流动性
 *                                         Total locked liquidity token amount, excludes skipped orders, corresponds to locked SOL liquidity
 * 
 *   **流动性状态标识 Liquidity Status Indicators:**
 *   - has_infinite_lp: {boolean} 是否包含无限流动性，true表示订单链表已结束且计算了到最小价格(MIN_U128_PRICE)的流动性
 *                                  Whether includes infinite liquidity, true means order chain ended and liquidity to min price (MIN_U128_PRICE) was calculated
 *   - pass_order_id: {number} 被跳过的订单在数组中的索引位置，-1表示没有跳过任何订单，>=0表示跳过了对应索引的订单
 *                               Index of skipped order in array, -1 means no order skipped, >=0 means order at that index was skipped
 * 
 *   **卖出执行信息 Sell Execution Info:**
 *   - force_close_num: {number} 需要强平的订单数量，表示为了卖出目标数量需要强制平仓多少个订单，0表示无需强平
 *                                 Number of orders that need to be force closed, indicates how many orders need force closure to sell target amount, 0 means no force closure needed
 *   - ideal_lp_sol_amount: {bigint} 理想SOL获得量，基于当前价格使用CurveAMM直接计算的理论最大SOL收益，不考虑流动性分布
 *                                     Ideal SOL amount obtainable, theoretical maximum SOL revenue calculated directly from current price using CurveAMM, ignores liquidity distribution
 *   - real_lp_sol_amount: {bigint} 实际SOL获得量，考虑真实流动性分布的精确SOL收益。0表示当前自由流动性不足以满足卖出需求，需要强平更多订单
 *                                    Actual SOL amount obtainable, precise SOL revenue considering real liquidity distribution. 0 means current free liquidity insufficient for sell requirement, need to force close more orders
 * 
 * @throws {Error} 参数验证错误：price、sellTokenAmount、orders、onceMaxOrder 参数无效 Parameter validation error: invalid price, sellTokenAmount, orders, or onceMaxOrder
 * @throws {Error} 价格转换错误：无法将价格参数转换为 BigInt Price conversion error: cannot convert price parameters to BigInt
 * @throws {Error} 流动性计算错误：CurveAMM 计算失败或数值转换错误 Liquidity calculation error: CurveAMM calculation failure or value conversion error
 * @throws {Error} 间隙流动性计算失败：价格间隙流动性计算异常 Gap liquidity calculation failure: price gap liquidity calculation exception
 * @throws {Error} 无限流动性计算失败：最小价格流动性计算异常 Infinite liquidity calculation failure: min price liquidity calculation exception
 * @throws {Error} 订单数据格式错误：订单对象缺少必需字段 Order data format error: order object missing required fields
 */
function calcLiqTokenSell(price, sellTokenAmount, orders, onceMaxOrder, passOrder = null) {
  // 由于是卖出操作 肯定拿的是 down_orders 方向的 订单  lock_lp_start_price >  lock_lp_end_price
  // 并且 lock_lp_start_price 在 orders 中是从大到小排序的

  // 参数验证
  if (!price && price !== 0) {
    throw new Error('参数验证错误：price 参数不能为空 Parameter validation error: price cannot be null');
  }
  if (!sellTokenAmount && sellTokenAmount !== 0) {
    throw new Error('参数验证错误：sellTokenAmount 参数不能为空 Parameter validation error: sellTokenAmount cannot be null');
  }
  if (!Array.isArray(orders)) {
    throw new Error('参数验证错误：orders 必须是数组 Parameter validation error: orders must be an array');
  }
  if (!onceMaxOrder || onceMaxOrder <= 0) {
    throw new Error('参数验证错误：onceMaxOrder 必须是正数 Parameter validation error: onceMaxOrder must be a positive number');
  }

  const result = {
    free_lp_sol_amount_sum: 0n,  // 间隙中可使用的sol流动性数量
    free_lp_token_amount_sum: 0n, // 间隙中可使用的token流动性数量
    lock_lp_sol_amount_sum: 0n,
    lock_lp_token_amount_sum: 0n,
    has_infinite_lp: false, // 是否包含无限流动性
    pass_order_id: -1, // 跳过的订单索引
    force_close_num: 0, // 强平订单数量
    ideal_lp_sol_amount: 0n, // 理想情况下卖出sellTokenAmount能获得的SOL数量
    real_lp_sol_amount: 0n, // 实际卖出sellTokenAmount能获得的SOL数量
  }

  let sellTokenAmountBigInt;
  try {
    sellTokenAmountBigInt = BigInt(sellTokenAmount);
  } catch (error) {
    throw new Error(`价格转换错误：无法将 sellTokenAmount 转换为 BigInt Price conversion error: Cannot convert sellTokenAmount to BigInt - ${error.message}`);
  }

  // 计算理想情况下卖出能获得的SOL数量
  try {
    const priceBigInt = BigInt(price);
    [_, result.ideal_lp_sol_amount] = CurveAMM.sellFromPriceWithTokenInput(priceBigInt, sellTokenAmountBigInt);
    //console.log(`理想计算: 当前价格=${priceBigInt}, 卖出代币=${sellTokenAmountBigInt}, 理想SOL=${result.ideal_lp_sol_amount}`);
  } catch (error) {
    throw new Error(`流动性计算错误：理想流动性计算失败 Liquidity calculation error: Ideal liquidity calculation failed - ${error.message}`);
  }

  // 选择较小值进行遍历
  const loopCount = Math.min(orders.length, onceMaxOrder);

  let counti = 0;
  for (let i = 0; i < loopCount; i++) {
    const order = orders[i];
    //console.log(`处理卖出订单[${i}]: 累计自由Token=${result.free_lp_token_amount_sum}, 目标=${sellTokenAmountBigInt}, 需要=${sellTokenAmountBigInt > result.free_lp_token_amount_sum}`);

    // 验证订单数据格式
    if (!order) {
      throw new Error(`订单数据格式错误：订单 ${i} 为空 Order data format error: Order ${i} is null`);
    }
    if (!order.lock_lp_start_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_start_price Order data format error: Order ${i} missing lock_lp_start_price`);
    }
    if (!order.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_end_price Order data format error: Order ${i} missing lock_lp_end_price`);
    }


    // 计算间隙流动性（卖出方向：从高价到低价）
    let startPrice, endPrice;
    try {
      if (i === 0) {
        // 第一个订单：从当前价格（高）到订单开始价格（低）的间隙
        startPrice = BigInt(price);
        endPrice = BigInt(order.lock_lp_start_price);
      } else {
        // 后续订单：从前一个订单结束价格（高）到当前订单开始价格（低）的间隙
        startPrice = BigInt(orders[i - 1].lock_lp_end_price);
        endPrice = BigInt(order.lock_lp_start_price);
      }
    } catch (error) {
      throw new Error(`价格转换错误：无法转换订单 ${i} 的价格数据 Price conversion error: Cannot convert price data for order ${i} - ${error.message}`);
    }


    // 如果存在价格间隙（卖出时startPrice应该大于endPrice）
    if (startPrice > endPrice) {
      try {
        const gapLiquidity = CurveAMM.sellFromPriceToPrice(startPrice, endPrice);
        if (gapLiquidity && Array.isArray(gapLiquidity) && gapLiquidity.length === 2) {
          const [tokenAmount, solAmount] = gapLiquidity;

          let prve_free_lp_sol_amount_sum;
          try {
            prve_free_lp_sol_amount_sum = result.free_lp_sol_amount_sum; // 上次的值
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            //console.log(`卖出间隙[${i}]: ${startPrice}→${endPrice}, 间隙Token=${tokenAmount}, 间隙SOL=${solAmount}, 累计自由Token=${result.free_lp_token_amount_sum}`);
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换间隙流动性数值 Liquidity calculation error: Cannot convert gap liquidity values - ${error.message}`);
          }

          // 计算实际获得的SOL数量 到能卖出为止
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum >= sellTokenAmountBigInt) {
              // 这时间隙流动性已经够卖出的了
              // 计算精确能获得多少SOL
              try {
                const actualSellAmount = sellTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                const [_, preciseSol] = CurveAMM.sellFromPriceWithTokenInput(startPrice, actualSellAmount);
                result.real_lp_sol_amount = prve_free_lp_sol_amount_sum + preciseSol;
                //console.log(`卖出实际计算[${i}]: 自由流动性已足够, actualSellAmount=${actualSellAmount}, preciseSol=${preciseSol}, 实际SOL=${result.real_lp_sol_amount}`);
                result.force_close_num = counti; // 强平订单数量
              } catch (error) {
                throw new Error(`流动性计算错误：精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`间隙流动性计算失败：返回数据格式错误 Gap liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('间隙流动性计算失败') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`间隙流动性计算失败：${error.message} Gap liquidity calculation failure: ${error.message}`);
      }
    } else {
    }

    // 检查是否需要跳过该订单（passOrder 逻辑）

    if (passOrder == order.order_pda) {

      // 将跳过订单的流动性加到自由流动性中
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Skipped order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：跳过订单 ${i} 缺少 lock_lp_token_amount Order data format error: Skipped order ${i} missing lock_lp_token_amount`);
        }

        const prevFreeSolSum = result.free_lp_sol_amount_sum; // 保存之前的值用于计算
        result.free_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.free_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);

        result.pass_order_id = i;


        // 检查跳过订单后的自由流动性是否已满足卖出需求
        if (result.real_lp_sol_amount === 0n) {
          if (result.free_lp_token_amount_sum >= sellTokenAmountBigInt) {
            // 自由流动性已经够卖出需求了
            try {
              // 计算精确能获得多少SOL
              const targetPrice = i === 0 ? BigInt(price) : BigInt(orders[i - 1].lock_lp_end_price);
              const actualSellAmount = sellTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(order.lock_lp_token_amount));
              const [_, preciseSol] = CurveAMM.sellFromPriceWithTokenInput(targetPrice, actualSellAmount);
              result.real_lp_sol_amount = prevFreeSolSum + preciseSol;
              result.force_close_num = counti;
            } catch (error) {
              throw new Error(`流动性计算错误：跳过订单后精确SOL计算失败 Liquidity calculation error: Precise SOL calculation failed after skipping order - ${error.message}`);
            }
          }
        }

      } catch (error) {
        if (error.message.includes('订单数据格式错误') || error.message.includes('流动性计算错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法处理跳过订单 ${i} 的流动性 Liquidity calculation error: Cannot process skipped order ${i} liquidity - ${error.message}`);
      }
    } else {
      // 累加锁定的流动性（正常情况）
      try {
        if (order.lock_lp_sol_amount === undefined || order.lock_lp_sol_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_sol_amount Order data format error: Order ${i} missing lock_lp_sol_amount`);
        }
        if (order.lock_lp_token_amount === undefined || order.lock_lp_token_amount === null) {
          throw new Error(`订单数据格式错误：订单 ${i} 缺少 lock_lp_token_amount Order data format error: Order ${i} missing lock_lp_token_amount`);
        }

        result.lock_lp_sol_amount_sum += BigInt(order.lock_lp_sol_amount);
        result.lock_lp_token_amount_sum += BigInt(order.lock_lp_token_amount);
      } catch (error) {
        if (error.message.includes('订单数据格式错误')) {
          throw error;
        }
        throw new Error(`流动性计算错误：无法累加订单 ${i} 的锁定流动性 Liquidity calculation error: Cannot accumulate locked liquidity for order ${i} - ${error.message}`);
      }

      counti += 1;
    }

  }

  // 如果遍历的订单数小于等于onceMaxOrder，说明链表结束，需要计算无限流动性
  if (orders.length <= onceMaxOrder && orders.length > 0) {

    const lastOrder = orders[orders.length - 1];
    if (!lastOrder || !lastOrder.lock_lp_end_price) {
      throw new Error(`订单数据格式错误：最后一个订单缺少 lock_lp_end_price Order data format error: Last order missing lock_lp_end_price`);
    }

    let lastEndPrice, minPrice;
    try {
      lastEndPrice = BigInt(lastOrder.lock_lp_end_price);
      minPrice = CurveAMM.MIN_U128_PRICE;
    } catch (error) {
      throw new Error(`价格转换错误：无法转换最后订单价格或最小价格 Price conversion error: Cannot convert last order price or min price - ${error.message}`);
    }


    if (lastEndPrice > minPrice) {

      try {
        const infiniteLiquidity = CurveAMM.sellFromPriceToPrice(lastEndPrice, minPrice);
        if (infiniteLiquidity && Array.isArray(infiniteLiquidity) && infiniteLiquidity.length === 2) {
          const [tokenAmount, solAmount] = infiniteLiquidity;

          let prevFreeSolSum;
          try {
            prevFreeSolSum = result.free_lp_sol_amount_sum;
            result.free_lp_sol_amount_sum += BigInt(solAmount);
            result.free_lp_token_amount_sum += BigInt(tokenAmount);
            result.has_infinite_lp = true;
          } catch (error) {
            throw new Error(`流动性计算错误：无法转换无限流动性数值 Liquidity calculation error: Cannot convert infinite liquidity values - ${error.message}`);
          }

          // 进入无限流动性后，计算实际获得的SOL数量
          if (result.real_lp_sol_amount === 0n) {
            if (result.free_lp_token_amount_sum >= sellTokenAmountBigInt) {
              // 无限流动性够卖出需求了
              try {
                const actualSellAmount = sellTokenAmountBigInt - (result.free_lp_token_amount_sum - BigInt(tokenAmount));
                const [_,preciseSol] = CurveAMM.sellFromPriceWithTokenInput(lastEndPrice, actualSellAmount);
                result.real_lp_sol_amount = prevFreeSolSum + preciseSol;
                result.force_close_num = counti; // 强平订单数量
              } catch (error) {
                throw new Error(`流动性计算错误：无限流动性精确SOL计算失败 Liquidity calculation error: Infinite liquidity precise SOL calculation failed - ${error.message}`);
              }
            }
          }

        } else {
          throw new Error(`无限流动性计算失败a：返回数据格式错误 Infinite liquidity calculation failure: Invalid return data format`);
        }
      } catch (error) {
        if (error.message.includes('无限流动性计算失败') || error.message.includes('流动性计算错误') || error.message.includes('订单数据格式错误') || error.message.includes('价格转换错误')) {
          throw error;
        }
        throw new Error(`无限流动性计算失败b：${error.message} Infinite liquidity calculation failure: ${error.message}`);
      }
    }
  }

  return result;
}

module.exports = {
  calcLiqTokenBuy,
  calcLiqTokenSell
};


