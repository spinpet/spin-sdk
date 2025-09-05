const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const TradingModule = require('./modules/trading');
const TokenModule = require('./modules/token');
const ParamModule = require('./modules/param');
const FastModule = require('./modules/fast');
const SimulatorModule = require('./modules/simulator');
const ChainModule = require('./modules/chain');
const OrderUtils = require('./utils/orderUtils');
const CurveAMM = require('./utils/curve_amm');
const spinpetIdl = require('./idl/spinpet.json');

/**
 * SpinPet SDK Main Class
 * Provides modular interfaces for interacting with SpinPet protocol
 */
class SpinPetSdk {
  /**
   * Constructor
   * @param {Connection} connection - Solana connection instance
   * @param {Wallet|Keypair} wallet - Wallet instance
   * @param {PublicKey|string} programId - Program ID
   * @param {Object} options - Configuration options (optional)
   */
  constructor(connection, programId, options = {}) {
    //console.log("SpinPetSdk options=",options)
    // Save configuration options
    this.options = options;
    
    // Validate defaultDataSource configuration
    if (options.defaultDataSource && !['fast', 'chain'].includes(options.defaultDataSource)) {
      throw new Error('defaultDataSource must be "fast" or "chain"');
    }

   //console.log("options.defaultDataSource",options.defaultDataSource)
    this.defaultDataSource = options.defaultDataSource || 'fast';
    console.log('Data source method:', this.defaultDataSource);
    
    // Basic configuration
    this.connection = connection;
    //this.wallet = wallet instanceof anchor.Wallet ? wallet : new anchor.Wallet(wallet);
    this.programId = typeof programId === 'string' ? new PublicKey(programId) : programId;
    
    // Initialize account configuration with options
    this.feeRecipient = this._parsePublicKey(this.options.fee_recipient);
    this.baseFeeRecipient = this._parsePublicKey(this.options.base_fee_recipient);
    this.paramsAccount = this._parsePublicKey(this.options.params_account);
    this.spinFastApiUrl = this.options.spin_fast_api_url;

    // Maximum number of orders that can be processed at once in the contract
    this.MAX_ORDERS_COUNT = 10
    // Maximum number of orders to fetch during queries
    this.FIND_MAX_ORDERS_COUNT = 1000

    // 在流动性不足时, 建议实际使用流动性的比例, 分每 (1000=100%)
    this.SUGGEST_LIQ_RATIO = 975; // 97.5% (1000=100%)

    // 如果设置了调试日志路径, 就会输出一些调试数据,如果没有设置, 则不输出
    this.debugLogPath = this.options.debug_log_path || this.options.debugLogPath || null;
    
    // 如果设置了调试日志路径，删除旧的 orderPda.txt 文件以确保文件是最新的
    if (this.debugLogPath && typeof this.debugLogPath === 'string') {
      const orderPdaFilePath = path.join(this.debugLogPath, 'orderPda.txt');
      try {
        if (fs.existsSync(orderPdaFilePath)) {
          fs.unlinkSync(orderPdaFilePath);
        }
      } catch (error) {
        console.warn('Warning: Failed to delete orderPda.txt:', error.message);
      }
      const orderOpenFilePath = path.join(this.debugLogPath, 'orderOpen.txt');
      try {
        if (fs.existsSync(orderOpenFilePath)) {
          fs.unlinkSync(orderOpenFilePath);
        }
      } catch (error) {
        console.warn('Warning: Failed to delete orderOpen.txt:', error.message);
      }


    }


    // Initialize Anchor program
    this.program = this._initProgram(this.options);
    
    // Initialize functional modules
    this.trading = new TradingModule(this);
    this.token = new TokenModule(this);
    this.param = new ParamModule(this);
    this.fast = new FastModule(this);
    this.simulator = new SimulatorModule(this);
    this.chain = new ChainModule(this);
    
    // Initialize curve AMM utility
    this.curve = CurveAMM;
    
    // Initialize unified data interface
    this.data = {
      orders: (mint, options = {}) => this._getDataWithSource('orders', [mint, options]),
      price: (mint, options = {}) => this._getDataWithSource('price', [mint, options])
    };
  }

  /**
   * Parse PublicKey
   * @private
   * @param {PublicKey|string|null} key - Key to parse
   * @returns {PublicKey|null}
   */
  _parsePublicKey(key) {
    if (!key) return null;
    return typeof key === 'string' ? new PublicKey(key) : key;
  }

  /**
   * Initialize Anchor program instance
   * @private
   */
  _initProgram(options = {}) {
    const provider = new anchor.AnchorProvider(
      this.connection,
      {
        commitment: options.commitment,
        preflightCommitment: options.preflightCommitment,
        skipPreflight: options.skipPreflight || false,
        maxRetries: options.maxRetries,
        ...options
      }
    );
    
    anchor.setProvider(provider);
    
    // Create program instance using imported IDL
    return new anchor.Program(spinpetIdl, this.programId);
  }

  // ========== Order Processing Utility Methods ==========

  /**
   * Build LP Pairs Array (for trading)
   * 
   * @param {Array} orders - Order array
   * @param {string} direction - Direction: 'up_orders' (short orders) or 'down_orders' (long orders)
   * @param {bigint|string|number} price - Current price (u128 format)
   * @returns {Array} LP pairs array, format: [{ solAmount: BN, tokenAmount: BN }, ...]
   * 
   * @example
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const currentPrice = await sdk.fast.price(mint);
   * const lpPairs = sdk.buildLpPairs(ordersData.data.orders, 'down_orders', currentPrice);
   * // Returns: [
   * //   { solAmount: new anchor.BN("63947874"), tokenAmount: new anchor.BN("65982364399") },
   * //   { solAmount: new anchor.BN("1341732020"), tokenAmount: new anchor.BN("1399566720549") },
   * //   ...
   * // ]
   */
  buildLpPairs(orders, direction, price) {
    return OrderUtils.buildLpPairs(orders, direction, price, this.MAX_ORDERS_COUNT);
  }

  /**
   * Build Order Accounts Array (for trading)
   * 
   * @param {Array} orders - Order array
   * @returns {Array} Order account address array, format: [string, string, ..., null, null]
   * 
   * @example
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const orderAccounts = sdk.buildOrderAccounts(ordersData.data.orders);
   * // Returns: [
   * //   "4fvsPDNoRRacSzE3PkEuNQeTNWMaeFqGwUxCnEbR1Dzb",
   * //   "G4nHBYX8EbrP8r35pk5TfpvJZfGNyLnd4qsfT7ru5vLd",
   * //   ...
   * //   null, null
   * // ]
   */
  buildOrderAccounts(orders) {
    return OrderUtils.buildOrderAccounts(orders, this.MAX_ORDERS_COUNT);
  }

  /**
   * Find Previous and Next Order
   * 
   * @param {Array} orders - Order array
   * @param {string} findOrderPda - Target order PDA address
   * @returns {Object} Returns { prevOrder: Object|null, nextOrder: Object|null }
   * 
   * @example
   * const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
   * const result = sdk.findPrevNext(ordersData.data.orders, 'E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA');
   * // Returns:
   * // {
   * //   prevOrder: { order_pda: "...", user: "...", ... } | null,
   * //   nextOrder: { order_pda: "...", user: "...", ... } | null
   * // }
   */
  findPrevNext(orders, findOrderPda) {
    return OrderUtils.findPrevNext(orders, findOrderPda);
  }

  // ========== Unified Data Interface Routing Method ==========

  /**
   * Route data requests based on configuration
   * 
   * @private
   * @param {string} method - Method name
   * @param {Array} args - Arguments array
   * @returns {Promise} Returns result from corresponding module method
   */
  _getDataWithSource(method, args) {
    // Extract dataSource configuration from last parameter
    const lastArg = args[args.length - 1] || {};
    const dataSource = lastArg.dataSource || this.defaultDataSource;
    
    // Route to corresponding module based on data source
    const module = dataSource === 'chain' ? this.chain : this.fast;
    
    if (!module[method]) {
      throw new Error(`Method ${method} does not exist in ${dataSource} module`);
    }
    
    return module[method](...args);
  }

}

module.exports = SpinPetSdk;
