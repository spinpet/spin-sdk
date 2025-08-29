const axios = require('axios');
const OrderUtils = require('../utils/orderUtils');
const CurveAMM = require('../utils/curve_amm');

/**
 * Data configuration mapping
 * Define processing methods and configurations for different data types
 */
const DATA_CONFIGS = {
  // Simple data types - direct API calls
  mints: {
    useManager: false,
    endpoint: '/api/mints',
    method: 'GET'
  },

  // Order data types - return raw data + utility methods
  orders: {
    useManager: false,
    endpoint: '/api/mint_orders',
    method: 'GET'
  },

  // Token details interface
  mint_info: {
    useManager: false,
    endpoint: '/api/details',
    method: 'POST'
  },

  // User orders interface
  user_orders: {
    useManager: false,
    endpoint: '/api/user_orders',
    method: 'GET'
  }
};

/**
 * Fast API Module
 * Access data through API interfaces from centralized servers, quickly obtain transaction parameters
 * Enables smooth trading operations
 */
class FastModule {
  constructor(sdk) {
    this.sdk = sdk;
    this.baseUrl = sdk.spinFastApiUrl;


    if (!this.baseUrl) {
      throw new Error('FastModule requires spinFastApiUrl configuration');
    }

    // Create axios instance
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Unified data access entry - intelligent proxy mode
   * @param {string} type - Data type ('mints', 'orders', 'price', etc.)
   * @param {Object} options - Request parameters
   * @returns {Promise<Object|DataManager>} Return data or manager instance based on type
   */
  async get(type, options = {}) {
    const config = DATA_CONFIGS[type];

    if (!config) {
      throw new Error(`Unsupported data type: ${type}`);
    }

    if (config.useManager) {
      // Complex data → return manager instance
      if (!config.ManagerClass) {
        throw new Error(`Data manager ${type} not yet implemented`);
      }
      return new config.ManagerClass(this.sdk, options);
    } else {
      // Simple data → directly return API result
      return this._directApiCall(config, options);
    }
  }

  /**
   * Get token list
   * @param {Object} options - Query parameters
   * @param {number} options.page - Page number, default 1
   * @param {number} options.limit - Items per page, default 10
   * @param {string} options.sort_by - Sort method, default 'slot_asc'
   * @returns {Promise<Object>} Token list data
   * 
   * @example
   * const result = await sdk.fast.mints({ page: 1, limit: 10 });
   * // Return format:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "mints": ["56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg", "4RGUZQ7PGF2JQWXKxr9hybPs1ZY3LWDb4QQ7FSHx92g9"],
   * //     "total": null,
   * //     "page": 1,
   * //     "limit": 10,
   * //     "has_next": false,
   * //     "has_prev": false,
   * //     "next_cursor": null,
   * //     "sort_by": "slot_asc"
   * //   },
   * //   "message": "Operation successful"
   * // }
   * 
   * // 使用代币地址:
   * const mintAddresses = result.data.mints; // 字符串数组
   */
  async mints(options = {}) {
    return this.get('mints', options);
  }

  /**
   * 获取代币详情信息
   * @param {string|Array} mint - 代币地址或地址数组
   * @returns {Promise<Object>} 代币详情数据
   * 
   * @example
   * // 获取单个代币详情
   * const info = await sdk.fast.mint_info('56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg');
   * // 返回格式:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "details": [
   * //       {
   * //         "mint_account": "56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg",
   * //         "payer": "Hfi9FpHeqAz8qih87NccCqRQY7VWs3JH8ixqqBXRBLH5",
   * //         "curve_account": "4xPzWMvbGT2AMmCMcvCw3h3PA3iG6kNKixfJyZ45r2BA",
   * //         "pool_token_account": "7FsTN832wYsfa1fThy4sKZiMNavVRJ6gPk3SXbEwcAXH",
   * //         "pool_sol_account": "3j4PfGm7YNhpBLijBHgNXggvVzsDMYTJW5fNJQ6cV89N",
   * //         "fee_recipient": "4nffmKaNrex34LkJ99RLxMt2BbgXeopUi8kJnom3YWbv",
   * //         "base_fee_recipient": "A2eUsnXoMniwjjkqkrxcRcugntAcBsEY7yusoo2HXRTf",
   * //         "params_account": "DVRnPDW1MvUhRhDfE1kU6aGHoQoufBCmQNbqUH4WFgUd",
   * //         "name": "Hello",
   * //         "symbol": "HLO",
   * //         "uri": "https://example.com/hello-token.json",
   * //         "swap_fee": 250,
   * //         "borrow_fee": 300,
   * //         "fee_discount_flag": 2,
   * //         "create_timestamp": 1755667440,
   * //         "latest_price": "13514066072452801812769",
   * //         "latest_trade_time": 1755667451,
   * //         "total_sol_amount": 214303125000,
   * //         "total_margin_sol_amount": 5837102249,
   * //         "total_force_liquidations": 4,
   * //         "total_close_profit": 1605153562,
   * //         "created_by": "Hfi9FpHeqAz8qih87NccCqRQY7VWs3JH8ixqqBXRBLH5",
   * //         "last_updated_at": "2025-08-20T05:24:12.327211706Z"
   * //       }
   * //     ],
   * //     "total": 1
   * //   },
   * //   "message": "Operation successful"
   * // }
   * 
   * // 获取多个代币详情
   * const info = await sdk.fast.mint_info(['56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg', 'another_mint_address']);
   * 
   * // 使用详情数据:
   * const details = info.data.details; // 详情数组
   * const firstDetail = details[0]; // 第一个代币的详情
   */
  async mint_info(mint) {
    // 确保 mint 是数组格式
    const mints = Array.isArray(mint) ? mint : [mint];

    // 验证输入
    if (mints.length === 0) {
      throw new Error('mint_info: 至少需要提供一个代币地址');
    }

    // 验证地址格式
    for (const mintAddress of mints) {
      if (!mintAddress || typeof mintAddress !== 'string') {
        throw new Error('mint_info: 代币地址必须是有效的字符串');
      }
    }

    return this.get('mint_info', { mints });
  }

  /**
   * 直接API调用方法
   * @private
   * @param {Object} config - 数据配置
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} API响应数据
   */
  async _directApiCall(config, params = {}) {
    try {
      //console.log(`FastModule: 请求API ${config.endpoint}`, params);

      const requestConfig = {
        method: config.method || 'GET',
        url: config.endpoint
      };

      // 根据请求方法设置参数
      if (config.method === 'POST') {
        requestConfig.data = params; // POST 请求使用 data
      } else {
        requestConfig.params = params; // GET 请求使用 params
      }

      const response = await this.httpClient.request(requestConfig);

      // 检查API响应格式
      if (!response.data || !response.data.success) {
        throw new Error(`API请求失败: ${response.data?.message || '未知错误'}`);
      }

      return response.data;

    } catch (error) {
      if (error.response) {
        // API返回错误
        throw new Error(`API请求失败 [${error.response.status}]: ${error.response.data?.message || error.message}`);
      } else if (error.request) {
        // 网络错误
        throw new Error(`网络请求失败: 无法连接到 ${this.baseUrl}`);
      } else {
        // 其他错误
        throw new Error(`请求处理失败: ${error.message}`);
      }
    }
  }



  // ========== 预留方法 ==========

  /**
   * 获取订单数据 Get Orders Data
   * @param {string} mint - 代币地址 Token mint address
   * @param {Object} options - 查询参数 Query parameters
   * @param {string} options.type - 订单类型 Order type: "up_orders" (做空/short) 或 "down_orders" (做多/long)
   * @param {number} options.page - 页码，默认1 Page number, default 1
   * @param {number} options.limit - 每页数量，默认500 Items per page, default 500
   * @returns {Promise<Object>} 订单数据，包含原始订单列表 Order data with raw order list
   * 
   * @example
   * // 获取做多订单 Get long orders
   * const ordersData = await sdk.fast.orders('6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee', { type: 'down_orders' });
   * 
   * // 返回值示例 Return value example:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "orders": [
   * //       {
   * //         "order_type": 1,                                    // 订单类型 1=做多, 2=做空
   * //         "mint": "6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee", // 代币地址
   * //         "user": "JD1eNPaJpbtejKfgimbLYLkvpsTHyYzKCCozVLGLS6zu",   // 用户地址
   * //         "lock_lp_start_price": "46618228118401293964111",    // LP 开始价格（字符串）
   * //         "lock_lp_end_price": "45827474968448818396222",     // LP 结束价格（字符串）
   * //         "lock_lp_sol_amount": 3299491609,                   // LP 锁定 SOL 数量（lamports）
   * //         "lock_lp_token_amount": 713848715669,               // LP 锁定代币数量（最小单位）
   * //         "start_time": 1756352482,                           // 开始时间（Unix 时间戳）
   * //         "end_time": 1756525282,                             // 结束时间（Unix 时间戳）
   * //         "margin_sol_amount": 571062973,                     // 保证金 SOL 数量（lamports）
   * //         "borrow_amount": 3860656108,                        // 借款数量（lamports）
   * //         "position_asset_amount": 713848715669,              // 持仓资产数量（最小单位）
   * //         "borrow_fee": 300,                                  // 借款费用（基点，300 = 3%）
   * //         "order_pda": "5aVwYyzvC5Y2qykDgwG8o7EUwCrL8WgCJpgxoH3mihYb" // 订单 PDA 地址
   * //       }
   * //     ],
   * //     "total": 12,                                            // 总订单数量
   * //     "order_type": "down_orders",                            // 订单类型（字符串）
   * //     "mint_account": "6ZDJtGFTzrF3FaN5uaqa1h8EexW7BtQd4FwA9Dt7m3ee", // 查询的代币地址
   * //     "page": 1,                                              // 当前页码
   * //     "limit": 50,                                            // 每页限制
   * //     "has_next": false,                                      // 是否有下一页
   * //     "has_prev": false                                       // 是否有上一页
   * //   },
   * //   "message": "Operation successful"                         // 操作结果消息
   * // }
   * 
   * // 使用工具方法处理数据 Use utility methods to process data:
   * const lpPairs = OrderUtils.buildLpPairs(ordersData.data.orders);         // 构建 LP 配对数组
   * const orderAccounts = OrderUtils.buildOrderAccounts(ordersData.data.orders); // 构建订单账户数组
   * 
   * // 访问订单数据 Access order data:
   * const orders = ordersData.data.orders;                        // 订单数组
   * const totalOrders = ordersData.data.total;                    // 总订单数量
   * const firstOrder = orders[0];                                 // 第一个订单
   * const orderPda = firstOrder.order_pda;                        // 订单 PDA 地址
   * const userAddress = firstOrder.user;                          // 用户地址
   * const marginAmount = firstOrder.margin_sol_amount;            // 保证金数量（lamports）
   * const borrowFee = firstOrder.borrow_fee;                      // 借款费用（基点）
   * 
   * // 获取做空订单 Get short orders:
   * const shortOrders = await sdk.fast.orders(mint, { type: 'up_orders' });
   * 
   * // 分页获取订单 Get paginated orders:
   * const pageTwo = await sdk.fast.orders(mint, { type: 'down_orders', page: 2, limit: 100 });
   */
  async orders(mint, options = {}) {
    const params = {
      mint: mint,
      type: options.type || 'down_orders',
      page: options.page || 1,
      limit: options.limit || 500,
      ...options
    };

    return this.get('orders', params);
  }

  /**
   * 获取价格数据（预留 - 简单直读模式）
   * @param {string} mint - 代币地址
   * @returns {Promise<string>} 最新价格字符串
   * 
   * @example
   * // 获取代币最新价格
   * const price = await sdk.fast.price('56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg');
   * console.log('最新价格 Latest price:', price); // "13514066072452801812769"
   */
  async price(mint) {
    // 验证输入 Validate input
    if (!mint || typeof mint !== 'string') {
      throw new Error('price: 代币地址必须是有效的字符串 mint address must be a valid string');
    }

    // 调用 mint_info 接口 Call mint_info API
    const result = await this.mint_info(mint);

    // 检查返回数据 Check return data
    if (!result || !result.data || !result.data.details || result.data.details.length === 0) {
      throw new Error('price: 无法获取代币信息 Unable to fetch token information');
    }

    // 提取最新价格 Extract latest price
    let latestPrice = result.data.details[0].latest_price;

    if (!latestPrice) {
      //throw new Error('price: 代币没有价格数据 Token has no price data');
      const initialPrice = CurveAMM.getInitialPrice();
      if (initialPrice === null) {
        throw new Error('price: 无法计算初始价格 Unable to calculate initial price');
      }
      latestPrice = initialPrice.toString();

    }

    return latestPrice;
  }

  /**
   * 获取用户订单 Get User Orders
   * @param {string} user - 用户地址
   * @param {string} mint - 代币地址
   * @param {Object} options - 查询参数
   * @param {number} options.page - 页码，默认1
   * @param {number} options.limit - 每页数量，默认200
   * @param {string} options.order_by - 排序方式，默认'start_time_desc'
   * @returns {Promise<Object>} 用户订单数据
   * 
   * @example
   * const userOrders = await sdk.fast.user_orders(
   *   '8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb',
   *   '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',
   *   { page: 1, limit: 200, order_by: 'start_time_desc' }
   * );
   * // 返回格式:
   * // {
   * //   "success": true,
   * //   "data": {
   * //     "orders": [
   * //       {
   * //         "order_type": 2,
   * //         "mint": "4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X",
   * //         "user": "8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb",
   * //         "lock_lp_start_price": "753522984132656210522",
   * //         "lock_lp_end_price": "833102733432007194898",
   * //         "lock_lp_sol_amount": 2535405978,
   * //         "lock_lp_token_amount": 32000000000000,
   * //         "start_time": 1755964862,
   * //         "end_time": 1756137662,
   * //         "margin_sol_amount": 1909140052,
   * //         "borrow_amount": 32000000000000,
   * //         "position_asset_amount": 656690798,
   * //         "borrow_fee": 1200,
   * //         "order_pda": "59yP5tpDP6DBcyy4mge9wKKKdLmk45Th4sbd6Un9LxVN"
   * //       }
   * //     ],
   * //     "total": 11,
   * //     "user": "8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb",
   * //     "mint_account": "4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X",
   * //     "page": 1,
   * //     "limit": 200,
   * //     "has_next": false,
   * //     "has_prev": false
   * //   },
   * //   "message": "Operation successful"
   * // }
   * 
   * // 使用订单数据:
   * const orders = userOrders.data.orders; // 订单数组
   * const totalCount = userOrders.data.total; // 总数量
   */
  async user_orders(user, mint, options = {}) {
    const params = {
      user: user,
      mint: mint,
      page: options.page || 1,
      limit: options.limit || 200,
      order_by: options.order_by || 'start_time_desc',
      ...options
    };

    return this.get('user_orders', params);
  }

  // /**
  //  * 查找订单的前后节点 Find Previous and Next Order
  //  * @param {Array} orders - 订单数组，参考 buildOrderAccounts 的 orders 参数
  //  * @param {string} findOrderPda - 要查找的订单PDA地址
  //  * @returns {Object} 返回 { prevOrder: Object|null, nextOrder: Object|null }
  //  * 
  //  * @example
  //  * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
  //  * const result = sdk.fast.findPrevNext(ordersData.data.orders, 'E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA');
  //  * // 返回格式:
  //  * // {
  //  * //   prevOrder: { order_pda: "...", user: "...", ... } | null,
  //  * //   nextOrder: { order_pda: "...", user: "...", ... } | null
  //  * // }
  //  * 
  //  * // 使用返回的数据:
  //  * if (result.prevOrder) {
  //  *   console.log('前一个订单 Previous Order:', result.prevOrder.order_pda);
  //  * }
  //  * if (result.nextOrder) {
  //  *   console.log('后一个订单 Next Order:', result.nextOrder.order_pda);
  //  * }
  //  */
  // findPrevNext(orders, findOrderPda) {
  //   return OrderUtils.findPrevNext(orders, findOrderPda);
  // }

  // // ========== 数据处理工具方法（代理到 OrderUtils）==========

  // /**
  //  * 构建 LP 配对数组（用于交易）
  //  * @param {Array} orders - 订单数组
  //  * @returns {Array} LP配对数组，格式: [{ solAmount: BN, tokenAmount: BN }, ...]
  //  * 
  //  * @example
  //  * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
  //  * const lpPairs = sdk.fast.buildLpPairs(ordersData.data.orders);
  //  * // 返回: [
  //  * //   { solAmount: new anchor.BN("63947874"), tokenAmount: new anchor.BN("65982364399") },
  //  * //   { solAmount: new anchor.BN("1341732020"), tokenAmount: new anchor.BN("1399566720549") },
  //  * //   ...
  //  * // ]
  //  */
  // buildLpPairs(orders) {
  //   return OrderUtils.buildLpPairs(orders, this.sdk.MAX_ORDERS_COUNT);
  // }

  // /**
  //  * 构建订单账户数组（用于交易）
  //  * @param {Array} orders - 订单数组
  //  * @returns {Array} 订单账户地址数组，格式: [string, string, ..., null, null]
  //  * 
  //  * @example
  //  * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
  //  * const orderAccounts = sdk.fast.buildOrderAccounts(ordersData.data.orders);
  //  * // 返回: [
  //  * //   "4fvsPDNoRRacSzE3PkEuNQeTNWMaeFqGwUxCnEbR1Dzb",
  //  * //   "G4nHBYX8EbrP8r35pk5TfpvJZfGNyLnd4qsfT7ru5vLd",
  //  * //   ...
  //  * //   null, null
  //  * // ]
  //  */
  // buildOrderAccounts(orders) {
  //   return OrderUtils.buildOrderAccounts(orders, this.sdk.MAX_ORDERS_COUNT);
  // }




}

module.exports = FastModule;
