const anchor = require('@coral-xyz/anchor');

/**
 * 订单数据处理工具模块
 * Order Data Processing Utilities Module
 * 
 * 提供订单数据格式转换和处理的纯函数工具方法
 * Provides pure function utilities for order data format conversion and processing
 */
class OrderUtils {
  
  /**
   * 构建 LP 配对数组（用于交易）- 基于价格区间分析
   * Build LP Pairs Array (for trading) - Based on price range analysis
   * 
   * @param {Array} orders - 订单数组 Order array
   * @param {string} direction - 方向 'up_orders' (做空订单) 或 'down_orders' (做多订单) Direction: 'up_orders' (short orders) or 'down_orders' (long orders)
   * @param {number} maxCount - 最大区间数量，默认10 Max price ranges count, default 10
   * @returns {Array} LP配对数组，格式: [{ solAmount: BN, tokenAmount: BN }, ...] 
   *                  LP pairs array, format: [{ solAmount: BN, tokenAmount: BN }, ...]
   * 
   * @example
   * // 获取做空订单并构建价格区间分析 Get short orders and build price range analysis
   * const ordersData = await sdk.fast.orders(mint, { type: 'up_orders' });
   * const lpPairs = OrderUtils.buildLpPairs(ordersData.data.orders, 'up_orders', 10);
   * 
   * // 获取做多订单并构建价格区间分析 Get long orders and build price range analysis
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const lpPairs = OrderUtils.buildLpPairs(ordersData.data.orders, 'down_orders', 10);
   * 
   * // 返回 Returns: [
   * //   { solAmount: new anchor.BN("63947874"), tokenAmount: new anchor.BN("65982364399") },
   * //   { solAmount: new anchor.BN("1341732020"), tokenAmount: new anchor.BN("1399566720549") },
   * //   ...
   * //   { solAmount: new anchor.BN("0"), tokenAmount: new anchor.BN("0") }, // 填充的空区间
   * // ]
   */
  static buildLpPairs(orders, direction, price, maxCount = 10) {
    const CurveAMM = require('./curve_amm');
    
    // 参数验证
    if (!Array.isArray(orders)) {
      throw new Error('buildLpPairs: orders 必须是数组 orders must be an array');
    }

    if (typeof direction !== 'string' || !['up_orders', 'down_orders'].includes(direction)) {
      throw new Error('buildLpPairs: direction 必须是 "up_orders" 或 "down_orders" direction must be "up_orders" or "down_orders"');
    }

    if (!price) {
      throw new Error('buildLpPairs: price 参数是必需的 price parameter is required');
    }

    if (!Number.isInteger(maxCount) || maxCount <= 0) {
      throw new Error('buildLpPairs: maxCount 必须是正整数 maxCount must be a positive integer');
    }

    // 转换价格为 bigint (u128 格式)
    const currentPriceU128 = typeof price === 'bigint' ? price : BigInt(price);

    const lpPairs = [];

    // 如果订单为空，创建一个覆盖到最大/最小价格的区间
    if (orders.length === 0) {
      if (direction === 'up_orders') {
        // 做空方向 - 价格上涨
        const buyResult = CurveAMM.buyFromPriceToPrice(currentPriceU128, CurveAMM.MAX_U128_PRICE);
        if (buyResult) {
          const [solAmount, tokenAmount] = buyResult;
          lpPairs.push({
            solAmount: new anchor.BN(solAmount.toString()),
            tokenAmount: new anchor.BN(tokenAmount.toString())
          });
        }
      } else {
        // 做多方向 - 价格下跌 
        const sellResult = CurveAMM.sellFromPriceToPrice(currentPriceU128, CurveAMM.MIN_U128_PRICE);
        if (sellResult) {
          const [tokenAmount, solAmount] = sellResult;
          lpPairs.push({
            solAmount: new anchor.BN(solAmount.toString()),
            tokenAmount: new anchor.BN(tokenAmount.toString())
          });
        }
      }
    } else {
      // 有订单的情况，构建价格区间
      const validOrders = orders.filter(order => order !== null);
      
      if (direction === 'up_orders') {
        // 做空订单 - 分析价格上涨时的流动性需求
        
        // 第一个区间：从当前价格到第一个订单开始价格
        if (validOrders.length > 0) {
          const firstOrderStartPrice = BigInt(validOrders[0].lock_lp_start_price);
          if (currentPriceU128 < firstOrderStartPrice) {
            const buyResult = CurveAMM.buyFromPriceToPrice(currentPriceU128, firstOrderStartPrice - 1n);
            if (buyResult) {
              const [solAmount, tokenAmount] = buyResult;
              lpPairs.push({
                solAmount: new anchor.BN(solAmount.toString()),
                tokenAmount: new anchor.BN(tokenAmount.toString())
              });
            }
          }
        }
        
        // 中间区间：订单之间的空隙
        for (let i = 0; i < validOrders.length - 1 && lpPairs.length < maxCount; i++) {
          const currentOrderEndPrice = BigInt(validOrders[i].lock_lp_end_price);
          const nextOrderStartPrice = BigInt(validOrders[i + 1].lock_lp_start_price);
          
          if (currentOrderEndPrice + 1n < nextOrderStartPrice) {
            const buyResult = CurveAMM.buyFromPriceToPrice(currentOrderEndPrice + 1n, nextOrderStartPrice - 1n);
            if (buyResult) {
              const [solAmount, tokenAmount] = buyResult;
              lpPairs.push({
                solAmount: new anchor.BN(solAmount.toString()),
                tokenAmount: new anchor.BN(tokenAmount.toString())
              });
            }
          }
        }
        
        // 最后一个区间：从最后订单结束价格到最大价格
        if (validOrders.length > 0 && lpPairs.length < maxCount) {
          const lastOrderEndPrice = BigInt(validOrders[validOrders.length - 1].lock_lp_end_price);
          const buyResult = CurveAMM.buyFromPriceToPrice(lastOrderEndPrice + 1n, CurveAMM.MAX_U128_PRICE);
          if (buyResult) {
            const [solAmount, tokenAmount] = buyResult;
            lpPairs.push({
              solAmount: new anchor.BN(solAmount.toString()),
              tokenAmount: new anchor.BN(tokenAmount.toString())
            });
          }
        }
        
      } else {
        // 做多订单 - 分析价格下跌时的流动性需求
        
        // 第一个区间：从当前价格到第一个订单开始价格
        if (validOrders.length > 0) {
          const firstOrderStartPrice = BigInt(validOrders[0].lock_lp_start_price);
          if (currentPriceU128 > firstOrderStartPrice) {
            const sellResult = CurveAMM.sellFromPriceToPrice(currentPriceU128, firstOrderStartPrice + 1n);
            if (sellResult) {
              const [tokenAmount, solAmount] = sellResult;
              lpPairs.push({
                solAmount: new anchor.BN(solAmount.toString()),
                tokenAmount: new anchor.BN(tokenAmount.toString())
              });
            }
          }
        }
        
        // 中间区间：订单之间的空隙
        for (let i = 0; i < validOrders.length - 1 && lpPairs.length < maxCount; i++) {
          const currentOrderEndPrice = BigInt(validOrders[i].lock_lp_end_price);
          const nextOrderStartPrice = BigInt(validOrders[i + 1].lock_lp_start_price);
          
          if (currentOrderEndPrice - 1n > nextOrderStartPrice) {
            const sellResult = CurveAMM.sellFromPriceToPrice(currentOrderEndPrice - 1n, nextOrderStartPrice + 1n);
            if (sellResult) {
              const [tokenAmount, solAmount] = sellResult;
              lpPairs.push({
                solAmount: new anchor.BN(solAmount.toString()),
                tokenAmount: new anchor.BN(tokenAmount.toString())
              });
            }
          }
        }
        
        // 最后一个区间：从最后订单结束价格到最小价格
        if (validOrders.length > 0 && lpPairs.length < maxCount) {
          const lastOrderEndPrice = BigInt(validOrders[validOrders.length - 1].lock_lp_end_price);
          const sellResult = CurveAMM.sellFromPriceToPrice(lastOrderEndPrice - 1n, CurveAMM.MIN_U128_PRICE);
          if (sellResult) {
            const [tokenAmount, solAmount] = sellResult;
            lpPairs.push({
              solAmount: new anchor.BN(solAmount.toString()),
              tokenAmount: new anchor.BN(tokenAmount.toString())
            });
          }
        }
      }
    }

    // 补齐到 maxCount 个元素
    while (lpPairs.length < maxCount) {
      lpPairs.push({
        solAmount: new anchor.BN(0),
        tokenAmount: new anchor.BN(0)
      });
    }

    // 确保不超过 maxCount
    if (lpPairs.length > maxCount) {
      lpPairs.splice(maxCount);
    }

    return lpPairs;
  }

  /**
   * 构建订单账户数组（用于交易）
   * Build Order Accounts Array (for trading)
   * 
   * @param {Array} orders - 订单数组 Order array
   * @param {number} maxCount - 最大订单数量，默认20 Max order count, default 20
   * @returns {Array} 订单账户地址数组，格式: [string, string, ..., null, null]
   *                  Order account address array, format: [string, string, ..., null, null]
   * 
   * @example
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const orderAccounts = OrderUtils.buildOrderAccounts(ordersData.data.orders);
   * // 返回 Returns: [
   * //   "4fvsPDNoRRacSzE3PkEuNQeTNWMaeFqGwUxCnEbR1Dzb",
   * //   "G4nHBYX8EbrP8r35pk5TfpvJZfGNyLnd4qsfT7ru5vLd",
   * //   ...
   * //   null, null
   * // ]
   * 
   * // 或者指定最大数量 Or specify max count
   * const orderAccounts = OrderUtils.buildOrderAccounts(ordersData.data.orders, 10);
   */
  static buildOrderAccounts(orders, maxCount = 10) {
    // 参数验证 Parameter validation
    if (!Array.isArray(orders)) {
      throw new Error('buildOrderAccounts: orders 必须是数组 orders must be an array');
    }

    if (!Number.isInteger(maxCount) || maxCount <= 0) {
      throw new Error('buildOrderAccounts: maxCount 必须是正整数 maxCount must be a positive integer');
    }

    const orderAccounts = [];
    
    for (let i = 0; i < maxCount; i++) {
      if (i < orders.length && orders[i] && orders[i].order_pda) {
        // 验证 order_pda 格式 Validate order_pda format
        if (typeof orders[i].order_pda !== 'string' || orders[i].order_pda.trim() === '') {
          console.warn(`buildOrderAccounts: 订单 ${i} 的 order_pda 格式无效: ${orders[i].order_pda}`);
          orderAccounts.push(null);
        } else {
          orderAccounts.push(orders[i].order_pda);
        }
      } else {
        // 填充空值 Fill null values
        orderAccounts.push(null);
      }
    }
    
    return orderAccounts;
  }

  /**
   * 查找订单的前后节点
   * Find Previous and Next Order
   * 
   * @param {Array} orders - 订单数组 Order array
   * @param {string} findOrderPda - 要查找的订单PDA地址 Target order PDA address to find
   * @returns {Object} 返回 { prevOrder: Object|null, nextOrder: Object|null }
   *                   Returns { prevOrder: Object|null, nextOrder: Object|null }
   * 
   * @example
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const result = OrderUtils.findPrevNext(ordersData.data.orders, 'E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA');
   * // 返回格式 Return format:
   * // {
   * //   prevOrder: { order_pda: "...", user: "...", ... } | null,
   * //   nextOrder: { order_pda: "...", user: "...", ... } | null
   * // }
   * 
   * // 使用返回的数据 Use returned data:
   * if (result.prevOrder) {
   *   console.log('前一个订单 Previous Order:', result.prevOrder.order_pda);
   * }
   * if (result.nextOrder) {
   *   console.log('后一个订单 Next Order:', result.nextOrder.order_pda);
   * }
   */
  static findPrevNext(orders, findOrderPda) {
    // 参数验证 Parameter validation
    if (!Array.isArray(orders)) {
      throw new Error('findPrevNext: orders 参数必须是数组 orders parameter must be an array');
    }
    
    if (!findOrderPda || typeof findOrderPda !== 'string') {
      throw new Error('findPrevNext: findOrderPda 参数必须是有效的字符串 findOrderPda parameter must be a valid string');
    }
    
    // 查找目标订单的索引 Find target order index
    let targetIndex = -1;
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] && orders[i].order_pda === findOrderPda) {
        targetIndex = i;
        break;
      }
    }
    
    // 如果没找到目标订单 If target order not found
    if (targetIndex === -1) {
      console.log(`findPrevNext: 未找到指定的订单PDA Order PDA not found: ${findOrderPda}`);
      return {
        prevOrder: null,
        nextOrder: null
      };
    }
    
    // 获取前一个订单 Get previous order
    let prevOrder = null;
    if (targetIndex > 0 && orders[targetIndex - 1]) {
      prevOrder = orders[targetIndex - 1];
    }
    
    // 获取下一个订单 Get next order
    let nextOrder = null;
    if (targetIndex < orders.length - 1 && orders[targetIndex + 1]) {
      nextOrder = orders[targetIndex + 1];
    }
    
    console.log(`findPrevNext: 找到目标订单索引 Found target order at index ${targetIndex}`);
    console.log(`findPrevNext: prevOrder = ${prevOrder ? prevOrder.order_pda : 'null'}`);
    console.log(`findPrevNext: nextOrder = ${nextOrder ? nextOrder.order_pda : 'null'}`);
    
    return {
      prevOrder,
      nextOrder
    };
  }

  /**
   * 验证订单数组格式
   * Validate Orders Array Format
   * 
   * @param {Array} orders - 订单数组 Order array
   * @param {boolean} throwOnError - 是否抛出错误，默认true Whether to throw error, default true
   * @returns {boolean|Object} 验证结果 Validation result
   * 
   * @example
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const isValid = OrderUtils.validateOrdersFormat(ordersData.data.orders);
   * 
   * // 或者获取详细验证结果 Or get detailed validation result
   * const result = OrderUtils.validateOrdersFormat(ordersData.data.orders, false);
   * // {
   * //   valid: true,
   * //   errors: [],
   * //   warnings: []
   * // }
   */
  static validateOrdersFormat(orders, throwOnError = true) {
    const errors = [];
    const warnings = [];

    // 基本类型检查 Basic type check
    if (!Array.isArray(orders)) {
      const error = 'orders 必须是数组 orders must be an array';
      if (throwOnError) {
        throw new Error(`validateOrdersFormat: ${error}`);
      }
      errors.push(error);
      return { valid: false, errors, warnings };
    }

    // 检查每个订单的必需字段 Check required fields for each order
    const requiredFields = [
      'order_pda', 'user', 'mint', 'order_type',
      'lock_lp_sol_amount', 'lock_lp_token_amount',
      'margin_sol_amount', 'borrow_amount', 'position_asset_amount'
    ];

    orders.forEach((order, index) => {
      if (!order) {
        warnings.push(`订单 ${index} 为空 Order ${index} is null`);
        return;
      }

      requiredFields.forEach(field => {
        if (!(field in order)) {
          warnings.push(`订单 ${index} 缺少字段 ${field} Order ${index} missing field ${field}`);
        }
      });

      // 检查 order_pda 格式 Check order_pda format
      if (order.order_pda && typeof order.order_pda !== 'string') {
        warnings.push(`订单 ${index} 的 order_pda 不是字符串 Order ${index} order_pda is not string`);
      }
    });

    const isValid = errors.length === 0;
    
    if (throwOnError && !isValid) {
      throw new Error(`validateOrdersFormat: 验证失败 Validation failed: ${errors.join(', ')}`);
    }

    return {
      valid: isValid,
      errors,
      warnings
    };
  }
}

module.exports = OrderUtils;