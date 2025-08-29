

// Liquidity reservation ratio - how much liquidity to reserve relative to the last locked liquidity
const LIQUIDITY_RESERVATION = 100;  // 100%

/**
 * Transform orders data format
 * @param {Object} ordersData - Raw orders data
 * @returns {Array} Transformed orders array
 */
function transformOrdersData(ordersData) {
  if (!ordersData || !ordersData.success || !ordersData.data || !ordersData.data.orders) {
    throw new Error('Invalid orders data format');
  }

  return ordersData.data.orders.map(order => ({
    order_type: order.order_type,
    lock_lp_start_price: BigInt(order.lock_lp_start_price),
    lock_lp_end_price: BigInt(order.lock_lp_end_price),
    lock_lp_sol_amount: order.lock_lp_sol_amount,
    lock_lp_token_amount: order.lock_lp_token_amount,
    order_pda: order.order_pda
  }));
}

/**
 * @typedef {Object} Order
 * @property {number} order_type - Order type (e.g., 1 for down_orders, 2 for up_orders).
 * @property {bigint} lock_lp_start_price - Locked liquidity start price.
 * @property {bigint} lock_lp_end_price - Locked liquidity end price.
 * @property {number} lock_lp_sol_amount - 锁定的SOL数量。
 * @property {number} lock_lp_token_amount - 锁定的代币数量。
 * @property {string} order_pda - 订单的PDA地址。
 */

/**
 * @typedef {Object} OverlapResult
 * @property {boolean} no_overlap - 是否没有重叠。`true` 表示没有重叠（可以安全插入），`false` 表示有重叠。
 * @property {string|null} prev_order_pda - 如果没有重叠，表示新区间逻辑上的前一个订单PDA。如果新区间是第一个，则为 `null`。
 * @property {string|null} next_order_pda - 如果没有重叠，表示新区间逻辑上的后一个订单PDA。如果新区间是最后一个，则为 `null`。
 * @property {string} overlap_reason - 重叠原因说明。当没有重叠时为空字符串，有重叠时说明具体原因。
 */

/**
 * 检查给定价格区间是否与已排序的订单列表中的任何区间发生重叠。
 * 此函数利用列表已排序的特性，通过优化的查找算法实现高性能。
 *
 * @param {'down_orders' | 'up_orders'} order_type - 订单类型。'down_orders' 表示价格从高到低排序，'up_orders' 表示价格从低到高排序。
 * @param {Order[]} order_list - 已排序的订单对象数组。
 * @param {bigint | number | string} lp_start_price - 需要检查的区间的起始价格。
 * @param {bigint | number | string} lp_end_price - 需要检查的区间的结束价格。
 * @returns {OverlapResult} - 返回一个包含重叠检查结果和相邻订单PDA的对象。
 *
 * @example
 * // down_orders 示例 (价格从高到低)
 * const downOrders = [
 *   { lock_lp_start_price: 100n, lock_lp_end_price: 90n, order_pda: 'pda1' },
 *   { lock_lp_start_price: 80n, lock_lp_end_price: 70n, order_pda: 'pda2' }
 * ];
 * // 无重叠，插入中间。逻辑上前一个是pda2(价格更低)，后一个是pda1(价格更高)
 * checkPriceRangeOverlap('down_orders', downOrders, 85n, 82n);
 * // 返回: { no_overlap: true, prev_order_pda: 'pda2', next_order_pda: 'pda1' }
 *
 * // 有重叠
 * checkPriceRangeOverlap('down_orders', downOrders, 95n, 85n);
 * // 返回: { no_overlap: false, prev_order_pda: null, next_order_pda: null }
 *
 * @example
 * // up_orders 示例 (价格从低到高)
 * const upOrders = [
 *   { lock_lp_start_price: 70n, lock_lp_end_price: 80n, order_pda: 'pda2' },
 *   { lock_lp_start_price: 90n, lock_lp_end_price: 100n, order_pda: 'pda1' }
 * ];
 * // 无重叠，插入末尾
 * checkPriceRangeOverlap('up_orders', upOrders, 110n, 120n);
 * // 返回: { no_overlap: true, prev_order_pda: 'pda1', next_order_pda: null }
 */
function checkPriceRangeOverlap(order_type, order_list, lp_start_price, lp_end_price) {
  const startPrice = BigInt(lp_start_price);
  const endPrice = BigInt(lp_end_price);

  if (order_list.length === 0) {
    return { no_overlap: true, prev_order_pda: null, next_order_pda: null, overlap_reason: "" };
  }

  const isDown = order_type === 'down_orders';

  // 验证并规范化输入价格区间，确保 minPrice <= maxPrice
  if ((isDown && startPrice < endPrice) || (!isDown && startPrice > endPrice)) {
    throw new Error('输入的起始和结束价格与订单类型规则不匹配。');
  }
  const minPrice = isDown ? endPrice : startPrice;
  const maxPrice = isDown ? startPrice : endPrice;

  let low = 0;
  let high = order_list.length - 1;
  let insertionIndex = order_list.length; // 默认插入到最后

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const order = order_list[mid];
    const orderStart = BigInt(order.lock_lp_start_price);
    const orderEnd = BigInt(order.lock_lp_end_price);

    const orderMin = isDown ? orderEnd : orderStart;
    const orderMax = isDown ? orderStart : orderEnd;

    // 核心重叠判断: (StartA < EndB) and (EndA > StartB)
    if (minPrice < orderMax && maxPrice > orderMin) {
      // 发生基础重叠，根据当前位置确定正确的插入位置和PDA
      let overlapInsertionIndex;
      if (isDown) {
        overlapInsertionIndex = maxPrice > orderMax ? mid : mid + 1;
      } else {
        overlapInsertionIndex = minPrice < orderMin ? mid : mid + 1;
      }
      
      const nextOrder = order_list[overlapInsertionIndex] || null;
      const prevOrder = order_list[overlapInsertionIndex - 1] || null;
      
      return { 
        no_overlap: false, 
        prev_order_pda: prevOrder ? prevOrder.order_pda : null, 
        next_order_pda: nextOrder ? nextOrder.order_pda : null, 
        overlap_reason: "Overlaps with existing order range" 
      };
    }

    if (isDown) {
      // down_orders: 价格从大到小 (orderMax 递减)
      if (maxPrice > orderMax) { // 新区间在当前区间的“左边”（价格更高）
        insertionIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    } else {
      // up_orders: 价格从小到大 (orderMin 递增)
      if (minPrice < orderMin) { // 新区间在当前区间的“左边”（价格更低）
        insertionIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  // 根据找到的插入点，确定逻辑上的前后 PDA
  // insertionIndex 是新区间应该插入的位置，使得列表依然有序
  const nextOrder = order_list[insertionIndex] || null;
  const prevOrder = order_list[insertionIndex - 1] || null;

  // 检查流动性预留重叠
  function checkLiquidityReservationOverlap(checkOrder) {
    if (!checkOrder) return false;
    
    const orderStart = BigInt(checkOrder.lock_lp_start_price);
    const orderEnd = BigInt(checkOrder.lock_lp_end_price);
    const orderMin = isDown ? orderEnd : orderStart;
    const orderMax = isDown ? orderStart : orderEnd;
    
    // 计算扩大区间值
    const expansionAmount = (orderMax - orderMin) * BigInt(Math.floor(LIQUIDITY_RESERVATION)) / 100n;
    
    let expandedStart, expandedEnd,hasOverlap;
    if (isDown) {
      // down_orders: start不变，end向下扩大
      expandedStart = orderMax;
      expandedEnd = orderMin - expansionAmount;
      if (startPrice < expandedEnd){
        hasOverlap = false;
      }else{
        hasOverlap = true;
      }
    } else {
      // up_orders: start不变，end向上扩大  
      expandedStart = orderMin;
      expandedEnd = orderMax + expansionAmount;
      if (startPrice > expandedEnd){
        hasOverlap = false;
      }else{
        hasOverlap = true;
      }
    }
    
    
    // if (hasOverlap) {
    //   console.log(`  Order range: ${orderMin}-${orderMax}`);
    //   console.log(`  Expanded range: ${expandedStart}-${expandedEnd}`);
    //   console.log(`  New range: ${minPrice}-${maxPrice}`);
    // }
    
    return hasOverlap;
  }

  // 检查与前一个订单的流动性预留重叠
  if (prevOrder && checkLiquidityReservationOverlap(prevOrder)) {
    return {
      no_overlap: false,
      prev_order_pda: prevOrder ? prevOrder.order_pda : null,
      next_order_pda: nextOrder ? nextOrder.order_pda : null,
      overlap_reason: "Overlaps with previous order's liquidity reservation range"
    };
  }



  // 无重叠，返回正确的PDA值
  // prev_order_pda: 插入位置的前一个节点 (索引更小)
  // next_order_pda: 插入位置的后一个节点 (索引更大)
  return {
    no_overlap: true,
    prev_order_pda: prevOrder ? prevOrder.order_pda : null,
    next_order_pda: nextOrder ? nextOrder.order_pda : null,
    overlap_reason: ""
  };
}


module.exports = {
  transformOrdersData,
  checkPriceRangeOverlap
};