const { ComputeBudgetProgram, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

/**
 * Trading Module
 * Handles buy/sell and long/short trading operations
 */
class TradingModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Buy tokens
   * @param {Object} params - Buy parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.buyTokenAmount - Amount of tokens to buy
   * @param {anchor.BN} params.maxSolAmount - Maximum SOL to spend
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.buy({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   buyTokenAmount: new anchor.BN("1000000000"),
   *   maxSolAmount: new anchor.BN("2000000000"),
   *   payer: wallet.publicKey
   * });
   */
  async buy({ mintAccount, buyTokenAmount, maxSolAmount, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount)) {
      throw new Error('buyTokenAmount and maxSolAmount must be anchor.BN type');
    }

    const currentPrice = await this.sdk.data.price(mintAccount);

    // 2. Get orders data
    const ordersData = await this.sdk.data.orders(mint.toString(), {
      type: 'up_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });

    // 3. Build transaction data
    const lpPairs = this.sdk.buildLpPairs(ordersData.data.orders, 'up_orders', currentPrice, this.sdk.MAX_ORDERS_COUNT);
    const orderAccounts = this.sdk.buildOrderAccounts(ordersData.data.orders);

    // 4. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 5. Get user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      payer
    );

    // 6. Check if user token account exists, create if not
    const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
    const createAtaIx = userTokenAccountInfo === null
      ? createAssociatedTokenAccountInstruction(
        payer,
        userTokenAccount,
        payer,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      : null;

    // 7. 构建订单账户参数
    const orderAccountsParams = this._buildOrderAccountsParams(orderAccounts);

    // 8. 构建交易指令

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const buyIx = await this.sdk.program.methods
      .buy(lpPairs, buyTokenAmount, maxSolAmount)
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        ...orderAccountsParams
      })
      .instruction();

    // 9. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);

    // If user token account doesn't exist, create it first
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }

    transaction.add(buyIx);

    // 9. Return transaction object and related info
    return {
      transaction,
      signers: [], // Buy transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        payer: payer
      },
      orderData: {
        ordersUsed: ordersData.data.orders.length,
        lpPairsCount: lpPairs.filter(p => !p.solAmount.isZero()).length,
        lpPairs: lpPairs,
        orderAccounts: orderAccounts
      }
    };


  }

  /**
   * Sell tokens
   * @param {Object} params - Sell parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.sellTokenAmount - Amount of tokens to sell
   * @param {anchor.BN} params.minSolOutput - Minimum SOL output
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.sell({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   sellTokenAmount: new anchor.BN("1000000000"),
   *   minSolOutput: new anchor.BN("2000000000"),
   *   payer: wallet.publicKey
   * });
   */
  async sell({ mintAccount, sellTokenAmount, minSolOutput, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. 参数验证和转换
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(sellTokenAmount) || !anchor.BN.isBN(minSolOutput)) {
      throw new Error('sellTokenAmount and minSolOutput must be anchor.BN type');
    }

    const currentPrice = await this.sdk.data.price(mintAccount);

    // 2. Get orders data (sell uses long orders)
    const ordersData = await this.sdk.data.orders(mint.toString(), {
      type: 'down_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });

    // 3. Build transaction data
    const lpPairs = this.sdk.buildLpPairs(ordersData.data.orders, 'down_orders', currentPrice, this.sdk.MAX_ORDERS_COUNT);
    const orderAccounts = this.sdk.buildOrderAccounts(ordersData.data.orders);

    // 4. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 5. Get user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      payer
    );

    // 6. Check if user token account exists, create if not
    const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
    const createAtaIx = userTokenAccountInfo === null
      ? createAssociatedTokenAccountInstruction(
        payer,
        userTokenAccount,
        payer,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      : null;

    // 7. Build order accounts parameters
    const orderAccountsParams = this._buildOrderAccountsParams(orderAccounts);

    // 8. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const sellIx = await this.sdk.program.methods
      .sell(lpPairs, sellTokenAmount, minSolOutput)
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        ...orderAccountsParams
      })
      .instruction();

    // 9. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);

    // If user token account doesn't exist, create it first
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }

    transaction.add(sellIx);

    // 9. Return transaction object and related info
    return {
      transaction,
      signers: [], // Sell transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        payer: payer
      },
      orderData: {
        ordersUsed: ordersData.data.orders.length,
        lpPairsCount: lpPairs.filter(p => !p.solAmount.isZero()).length,
        lpPairs: lpPairs,
        orderAccounts: orderAccounts
      }
    };
  }

  /**
   * Margin Long
   * @param {Object} params - Long parameters
   * @param {string|PublicKey} params.mintAccount - Token mint account address
   * @param {anchor.BN} params.buyTokenAmount - Amount of tokens to buy
   * @param {anchor.BN} params.maxSolAmount - Maximum SOL to spend
   * @param {anchor.BN} params.marginSol - Margin amount
   * @param {anchor.BN} params.closePrice - Close price
   * @param {PublicKey} params.payer - Payer public key
   * @param {Object} options - Optional parameters
   * @param {number} options.computeUnits - Compute units limit, default 1400000
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.long({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   buyTokenAmount: new anchor.BN("10000000"),
   *   maxSolAmount: new anchor.BN("1100000000"),
   *   marginSol: new anchor.BN("2200000000"),
   *   closePrice: new anchor.BN("1000000000000000"),
   *   payer: wallet.publicKey
   * });
   */
  async long({ mintAccount, buyTokenAmount, maxSolAmount, marginSol, closePrice, prevOrder, nextOrder, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. 参数验证和转换
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount) ||
      !anchor.BN.isBN(marginSol) || !anchor.BN.isBN(closePrice)) {
      throw new Error('All parameters must be anchor.BN type');
    }
    const currentPrice = await this.sdk.data.price(mintAccount);

    // 2. Get orders data (long uses short orders)
    const ordersData = await this.sdk.data.orders(mint.toString(), {
      type: 'up_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });

    // 3. Build transaction data
    const lpPairs = this.sdk.buildLpPairs(ordersData.data.orders, 'up_orders', currentPrice, this.sdk.MAX_ORDERS_COUNT);
    const orderAccounts = this.sdk.buildOrderAccounts(ordersData.data.orders);

    // 4. Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 5. Build order accounts parameters
    const orderAccountsParams = this._buildOrderAccountsParams(orderAccounts);

    // 6. Generate uniqueSeed (random number)
    const uniqueSeed = new anchor.BN(Date.now());

    // 7. Generate long order account PDA
    const [selfOrderAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("self_margin_order"),
        payer.toBuffer(),
        mint.toBuffer(),
        uniqueSeed.toArrayLike(Buffer, 'le', 8)
      ],
      this.sdk.programId
    );

    // 如果设置了调试日志路径，将订单地址写入 orderPda.txt 文件
    if (this.sdk.debugLogPath && typeof this.sdk.debugLogPath === 'string') {
      try {
        const orderPdaFilePath = path.join(this.sdk.debugLogPath, 'orderPda.txt');
        fs.appendFileSync(orderPdaFilePath, `${selfOrderAddress.toString()}\n`);
      } catch (error) {
        console.warn('Warning: Failed to write order PDA to file:', error.message);
      }

      try {
        const orderOpenFilePath = path.join(this.sdk.debugLogPath, 'orderOpen.txt');
        const prevOrderStr = prevOrder ? prevOrder.toString() : 'null';
        const nextOrderStr = nextOrder ? nextOrder.toString() : 'null';
        fs.appendFileSync(orderOpenFilePath, `long ${prevOrderStr} -> ${selfOrderAddress.toString()} -> ${nextOrderStr}\n`);
      } catch (error) {
        console.warn('Warning: Failed to write order chain to file:', error.message);
      }
    }

    // // 8. Get prevOrder and nextOrder (simplified calculation)
    // // Use simplified logic here, in actual project you can call simulator as needed
    // const prevOrder = null; // Can calculate as needed
    // const nextOrder = null; // Can calculate as needed

    // 9. Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const longIx = await this.sdk.program.methods
      .long(
        uniqueSeed,
        lpPairs,
        buyTokenAmount,
        maxSolAmount,
        marginSol,
        closePrice
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        selfOrder: selfOrderAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        ...orderAccountsParams,
        prevOrder: prevOrder,
        nextOrder: nextOrder
      })
      .instruction();

    // 10. Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(longIx);

    // 11. Return transaction object and related info
    return {
      transaction,
      signers: [], // Long transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        payer: payer,
        selfOrder: selfOrderAddress
      },
      orderData: {
        ordersUsed: ordersData.data.orders.length,
        lpPairsCount: lpPairs.filter(p => !p.solAmount.isZero()).length,
        lpPairs: lpPairs,
        orderAccounts: orderAccounts,
        uniqueSeed: uniqueSeed,
        prevOrder: prevOrder,
        nextOrder: nextOrder
      }
    };
  }

  /**
   * 保证金做空 / Margin Short
   * @param {Object} params - 做空参数 / Short parameters
   * @param {string|PublicKey} params.mintAccount - 代币铸造账户地址 / Token mint account address
   * @param {anchor.BN} params.borrowSellTokenAmount - 借出卖出的代币数量 / Borrowed token amount to sell
   * @param {anchor.BN} params.minSolOutput - 最小 SOL 输出 / Minimum SOL output
   * @param {anchor.BN} params.marginSol - 保证金数量 / Margin amount
   * @param {anchor.BN} params.closePrice - 平仓价格 / Close price
   * @param {PublicKey|null} params.prevOrder - 前一个订单 / Previous order
   * @param {PublicKey|null} params.nextOrder - 下一个订单 / Next order
   * @param {PublicKey} params.payer - 支付者公钥 / Payer public key
   * @param {Object} options - 可选参数 / Optional parameters
   * @param {number} options.computeUnits - 计算单元限制，默认 1400000 / Compute units limit, default 1400000
   * @returns {Promise<Object>} 包含交易对象、签名者和账户信息的对象 / Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.short({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   borrowSellTokenAmount: new anchor.BN("1000000000"),
   *   minSolOutput: new anchor.BN("100"),
   *   marginSol: new anchor.BN("2200000000"),
   *   closePrice: new anchor.BN("1000000000000000"),
   *   prevOrder: null,
   *   nextOrder: null,
   *   payer: wallet.publicKey
   * });
   */
  async short({ mintAccount, borrowSellTokenAmount, minSolOutput, marginSol, closePrice, prevOrder, nextOrder, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. 参数验证和转换 / Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;

    if (!anchor.BN.isBN(borrowSellTokenAmount) || !anchor.BN.isBN(minSolOutput) ||
      !anchor.BN.isBN(marginSol) || !anchor.BN.isBN(closePrice)) {
      throw new Error('所有参数必须是 anchor.BN 类型 / All parameters must be anchor.BN type');
    }
    const currentPrice = await this.sdk.data.price(mintAccount);

    // 2. 获取订单数据（做空使用做多订单）/ Get orders data (short uses long orders)
    const ordersData = await this.sdk.data.orders(mint.toString(), {
      type: 'down_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });

    // 3. 构建交易数据 / Build transaction data
    const lpPairs = this.sdk.buildLpPairs(ordersData.data.orders, 'down_orders', currentPrice, this.sdk.MAX_ORDERS_COUNT);
    const orderAccounts = this.sdk.buildOrderAccounts(ordersData.data.orders);

    // 4. 计算 PDA 账户 / Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    //console.log('curveAccount', accounts.curveAccount);

    // 5. 构建订单账户参数 / Build order accounts parameters
    const orderAccountsParams = this._buildOrderAccountsParams(orderAccounts);

    // 6. 生成 uniqueSeed（随机数）/ Generate uniqueSeed (random number)
    const uniqueSeed = new anchor.BN(Date.now());

    // 7. 生成做空订单账户 PDA / Generate short order account PDA
    const [selfOrderAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("self_margin_order"),
        payer.toBuffer(),
        mint.toBuffer(),
        uniqueSeed.toArrayLike(Buffer, 'le', 8)
      ],
      this.sdk.programId
    );

    // 如果设置了调试日志路径，将订单地址写入 orderPda.txt 文件
    if (this.sdk.debugLogPath && typeof this.sdk.debugLogPath === 'string') {
      try {
        const orderPdaFilePath = path.join(this.sdk.debugLogPath, 'orderPda.txt');
        fs.appendFileSync(orderPdaFilePath, `${selfOrderAddress.toString()}\n`);
      } catch (error) {
        console.warn('Warning: Failed to write order PDA to file:', error.message);
      }

      try {
        const orderOpenFilePath = path.join(this.sdk.debugLogPath, 'orderOpen.txt');
        const prevOrderStr = prevOrder ? prevOrder.toString() : 'null';
        const nextOrderStr = nextOrder ? nextOrder.toString() : 'null';
        fs.appendFileSync(orderOpenFilePath, `short ${prevOrderStr} -> ${selfOrderAddress.toString()} -> ${nextOrderStr}\n`);
      } catch (error) {
        console.warn('Warning: Failed to write order chain to file:', error.message);
      }
    }

    // 8. 获取用户代币账户 / Get user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      payer
    );

    // 9. 构建交易指令 / Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const shortIx = await this.sdk.program.methods
      .short(
        uniqueSeed,
        lpPairs,
        borrowSellTokenAmount,
        minSolOutput,
        marginSol,
        closePrice
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        selfOrder: selfOrderAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        ...orderAccountsParams,
        prevOrder: prevOrder,
        nextOrder: nextOrder
      })
      .instruction();

    // 10. 创建交易并添加指令 / Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(shortIx);

    // 11. 返回交易对象和相关信息 / Return transaction object and related info
    return {
      transaction,
      signers: [], // 做空交易不需要额外的签名者，只需要 payer 签名 / Short transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        payer: payer,
        selfOrder: selfOrderAddress
      },
      orderData: {
        ordersUsed: ordersData.data.orders.length,
        lpPairsCount: lpPairs.filter(p => !p.solAmount.isZero()).length,
        lpPairs: lpPairs,
        orderAccounts: orderAccounts,
        uniqueSeed: uniqueSeed,
        prevOrder: prevOrder,
        nextOrder: nextOrder
      }
    };
  }

  /**
   * 平仓做多 / Close Long Position
   * @param {Object} params - 平仓参数 / Close position parameters
   * @param {string|PublicKey} params.mintAccount - 代币铸造账户地址 / Token mint account address
   * @param {string|PublicKey} params.closeOrder - 需要关闭的订单地址 / Order address to close
   * @param {anchor.BN} params.sellTokenAmount - 希望卖出的token数量 / Amount of tokens to sell
   * @param {anchor.BN} params.minSolOutput - 卖出后最少得到的sol数量 / Minimum SOL output after selling
   * @param {PublicKey} params.payer - 支付者公钥 / Payer public key
   * @param {Object} options - 可选参数 / Optional parameters
   * @param {number} options.computeUnits - 计算单元限制，默认1400000 / Compute units limit, default 1400000
   * @returns {Promise<Object>} 包含交易对象、签名者和账户信息的对象 / Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.closeLong({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   closeOrder: "E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA",
   *   sellTokenAmount: new anchor.BN("1000000000"),
   *   minSolOutput: new anchor.BN("100000000"),
   *   payer: wallet.publicKey
   * });
   */
  async closeLong({ mintAccount, closeOrder, sellTokenAmount, minSolOutput, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. 参数验证和转换 / Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;
    const closeOrderPubkey = typeof closeOrder === 'string' ? new PublicKey(closeOrder) : closeOrder;

    if (!anchor.BN.isBN(sellTokenAmount) || !anchor.BN.isBN(minSolOutput)) {
      throw new Error('sellTokenAmount 和 minSolOutput 必须是 anchor.BN 类型 / sellTokenAmount and minSolOutput must be anchor.BN type');
    }



    // 我的关闭损订单数据以便查找前后节点 / Get orders data to find prev/next nodes
    const ordersStopData = await this.sdk.data.orders(mint.toString(), {
      type: 'down_orders',
      page: 1,
      limit: this.FIND_MAX_ORDERS_COUNT
    });

    // 3. 使用 findPrevNext 查找前后订单 / Use findPrevNext to find prev/next orders
    const prevNext = this.sdk.findPrevNext(ordersStopData.data.orders, closeOrderPubkey.toString());
    const prevOrder = prevNext.prevOrder ? new PublicKey(prevNext.prevOrder.order_pda) : null;
    const nextOrder = prevNext.nextOrder ? new PublicKey(prevNext.nextOrder.order_pda) : null;

    console.log(`closeLong: Found previous order: ${prevOrder ? prevOrder.toString() : 'null'}`);
    console.log(`closeLong: Found next order: ${nextOrder ? nextOrder.toString() : 'null'}`);


    // 如果设置了调试日志路径，将订单地址写入 orderPda.txt 文件
    if (this.sdk.debugLogPath && typeof this.sdk.debugLogPath === 'string') {
      try {
        const orderOpenFilePath = path.join(this.sdk.debugLogPath, 'orderOpen.txt');
        const prevOrderStr = prevOrder ? prevOrder.toString() : 'null';
        const nextOrderStr = nextOrder ? nextOrder.toString() : 'null';
        fs.appendFileSync(orderOpenFilePath, `closeLong ${prevOrderStr} -> ${closeOrderPubkey.toString()} -> ${nextOrderStr}\n`);
      } catch (error) {
        console.warn('Warning: Failed to write order chain to file:', error.message);
      }
    }


    // 获取止损订单数据以便查找前后节点 / Get orders data to find prev/next nodes
    const ordersData = await this.sdk.data.orders(mint.toString(), {
      type: 'down_orders',
      limit: this.sdk.MAX_ORDERS_COUNT + 1
    });


    // 4. 获取当前价格并构建 lpPairs / Get current price and build lpPairs
    const currentPrice = await this.sdk.data.price(mintAccount);
    const lpPairs = this.sdk.buildLpPairs(ordersData.data.orders, 'down_orders', currentPrice);

    // 5. 计算 PDA 账户 / Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 6. 构建订单账户数组（基于 lpPairs 对应的订单）/ Build order accounts array
    const orderAccounts = this.sdk.buildOrderAccounts(ordersData.data.orders);

    // 7. 构建订单账户参数 / Build order accounts parameters
    const orderAccountsParams = this._buildOrderAccountsParams(orderAccounts);

    // 8. 构建交易指令 / Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const closeLongIx = await this.sdk.program.methods
      .closeLong(
        lpPairs,           // lp_pairs: LP配对数组 / LP pairs array
        sellTokenAmount,   // sell_token_amount: 希望卖出的token数量 / Amount of tokens to sell
        minSolOutput       // min_sol_output: 卖出后最少得到的sol数量 / Minimum SOL output after selling
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userSolAccount: payer, // 用户SOL账户，通常是payer本身 / User SOL account, usually the payer itself
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        ...orderAccountsParams,
        prevOrder: prevOrder,      // 前一个订单 / Previous order
        closeOrder: closeOrderPubkey,  // 要关闭的订单 / Order to close
        nextOrder: nextOrder       // 下一个订单 / Next order
      })
      .instruction();

    // 9. 创建交易并添加指令 / Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);
    transaction.add(closeLongIx);

    // 10. 返回交易对象和相关信息 / Return transaction object and related info
    return {
      transaction,
      signers: [], // 平仓做多交易不需要额外的签名者，只需要 payer 签名 / Close long transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        payer: payer,
        closeOrder: closeOrderPubkey,
        prevOrder: prevOrder,
        nextOrder: nextOrder
      },
      orderData: {
        ordersUsed: ordersData.data.orders.length,
        lpPairsCount: lpPairs.filter(p => !p.solAmount.isZero()).length,
        lpPairs: lpPairs,
        orderAccounts: orderAccounts,
        prevOrder: prevOrder,
        nextOrder: nextOrder,
        closeOrderAddress: closeOrderPubkey.toString()
      }
    };
  }

  /**
   * 平仓做空 Close Short Position
   * @param {Object} params - 平仓参数 Close position parameters
   * @param {string|PublicKey} params.mintAccount - 代币铸造账户地址 Token mint account address
   * @param {string|PublicKey} params.closeOrder - 需要关闭的订单地址 Order address to close
   * @param {anchor.BN} params.buyTokenAmount - 希望买入的token数量 Amount of tokens to buy
   * @param {anchor.BN} params.maxSolAmount - 愿意给出的最大sol数量 Maximum SOL amount to spend
   * @param {PublicKey} params.payer - 支付者公钥 Payer public key
   * @param {Object} options - 可选参数 Optional parameters
   * @param {number} options.computeUnits - 计算单元限制，默认1400000 Compute units limit, default 1400000
   * @returns {Promise<Object>} 包含交易对象、签名者和账户信息的对象 Object containing transaction, signers and account info
   * 
   * @example
   * const result = await sdk.trading.closeShort({
   *   mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
   *   closeOrder: "E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA",
   *   buyTokenAmount: new anchor.BN("1000000000"),
   *   maxSolAmount: new anchor.BN("100000000"),
   *   payer: wallet.publicKey
   * });
   */
  async closeShort({ mintAccount, closeOrder, buyTokenAmount, maxSolAmount, payer }, options = {}) {
    const { computeUnits = 1400000 } = options;

    // 1. 参数验证和转换 Parameter validation and conversion
    const mint = typeof mintAccount === 'string' ? new PublicKey(mintAccount) : mintAccount;
    const closeOrderPubkey = typeof closeOrder === 'string' ? new PublicKey(closeOrder) : closeOrder;

    if (!anchor.BN.isBN(buyTokenAmount) || !anchor.BN.isBN(maxSolAmount)) {
      throw new Error('buyTokenAmount 和 maxSolAmount 必须是 anchor.BN 类型 buyTokenAmount and maxSolAmount must be anchor.BN type');
    }

    // 我的关闭损订单数据以便查找前后节点 / Get orders data to find prev/next nodes
    const ordersStopData = await this.sdk.data.orders(mint.toString(), {
      type: 'up_orders',
      limit: this.FIND_MAX_ORDERS_COUNT
    });

    // 3. 使用 findPrevNext 查找前后订单 Use findPrevNext to find prev/next orders
    const prevNext = this.sdk.findPrevNext(ordersStopData.data.orders, closeOrderPubkey.toString());
    const prevOrder = prevNext.prevOrder ? new PublicKey(prevNext.prevOrder.order_pda) : null;
    const nextOrder = prevNext.nextOrder ? new PublicKey(prevNext.nextOrder.order_pda) : null;

    console.log(`closeShort: Found previous order: ${prevOrder ? prevOrder.toString() : 'null'}`);
    console.log(`closeShort: Found next order: ${nextOrder ? nextOrder.toString() : 'null'}`);

    // 如果设置了调试日志路径，将订单地址写入 orderPda.txt 文件
    if (this.sdk.debugLogPath && typeof this.sdk.debugLogPath === 'string') {
      try {
        const orderOpenFilePath = path.join(this.sdk.debugLogPath, 'orderOpen.txt');
        const prevOrderStr = prevOrder ? prevOrder.toString() : 'null';
        const nextOrderStr = nextOrder ? nextOrder.toString() : 'null';
        fs.appendFileSync(orderOpenFilePath, `closeShort ${prevOrderStr} -> ${closeOrderPubkey.toString()} -> ${nextOrderStr}\n`);
      } catch (error) {
        console.warn('Warning: Failed to write order chain to file:', error.message);
      }
    }

    // 2. 获取订单数据以便查找前后节点 Get orders data to find prev/next nodes
    const ordersData = await this.sdk.data.orders(mint.toString(), {
      type: 'up_orders',
      limit: this.sdk.MAX_ORDERS_COUNT+1
    });

    // 4. 获取当前价格并构建 lpPairs / Get current price and build lpPairs
    const currentPrice = await this.sdk.data.price(mintAccount);
    const lpPairs = this.sdk.buildLpPairs(ordersData.data.orders, 'up_orders', currentPrice);

    // 5. 计算 PDA 账户 Calculate PDA accounts
    const accounts = this._calculatePDAAccounts(mint);

    // 6. 构建订单账户数组（基于 lpPairs 对应的订单）Build order accounts array
    const orderAccounts = this.sdk.buildOrderAccounts(ordersData.data.orders);

    // 7. 构建订单账户参数 Build order accounts parameters
    const orderAccountsParams = this._buildOrderAccountsParams(orderAccounts);

    // 8. 获取用户代币账户 Get user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      payer
    );

    // 9. 检查用户代币账户是否存在，如果不存在则创建 Check if user token account exists, create if not
    const userTokenAccountInfo = await this.sdk.connection.getAccountInfo(userTokenAccount);
    const createAtaIx = userTokenAccountInfo === null
      ? createAssociatedTokenAccountInstruction(
        payer,
        userTokenAccount,
        payer,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      : null;

    // 10. 构建交易指令 Build transaction instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });

    const closeShortIx = await this.sdk.program.methods
      .closeShort(
        lpPairs,           // lp_pairs: LP配对数组 LP pairs array
        buyTokenAmount,    // buy_token_amount: 希望买入的token数量 Amount of tokens to buy
        maxSolAmount       // max_sol_amount: 愿意给出的最大sol数量 Maximum SOL amount to spend
      )
      .accounts({
        payer: payer,
        mintAccount: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        userSolAccount: payer, // 用户SOL账户，通常是payer本身 User SOL account, usually the payer itself
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        feeRecipientAccount: this.sdk.feeRecipient,
        baseFeeRecipientAccount: this.sdk.baseFeeRecipient,
        ...orderAccountsParams,
        prevOrder: prevOrder,      // 前一个订单 Previous order
        closeOrder: closeOrderPubkey,  // 要关闭的订单 Order to close
        nextOrder: nextOrder       // 下一个订单 Next order
      })
      .instruction();

    // 11. 创建交易并添加指令 Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(modifyComputeUnits);

    // 如果用户代币账户不存在，先创建账户 If user token account doesn't exist, create it first
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }

    transaction.add(closeShortIx);

    // 12. 返回交易对象和相关信息 Return transaction object and related info
    return {
      transaction,
      signers: [], // 平仓做空交易不需要额外的签名者，只需要 payer 签名 Close short transaction doesn't need additional signers, only payer signature
      accounts: {
        mint: mint,
        curveAccount: accounts.curveAccount,
        poolTokenAccount: accounts.poolTokenAccount,
        poolSolAccount: accounts.poolSolAccount,
        userTokenAccount: userTokenAccount,
        payer: payer,
        closeOrder: closeOrderPubkey,
        prevOrder: prevOrder,
        nextOrder: nextOrder
      },
      orderData: {
        ordersUsed: ordersData.data.orders.length,
        lpPairsCount: lpPairs.filter(p => !p.solAmount.isZero()).length,
        lpPairs: lpPairs,
        orderAccounts: orderAccounts,
        prevOrder: prevOrder,
        nextOrder: nextOrder,
        closeOrderAddress: closeOrderPubkey.toString()
      }
    };
  }

  /**
   * 计算 PDA 账户
   * @private
   * @param {PublicKey} mintAccount - 代币铸造账户
   * @returns {Object} PDA 账户对象
   */
  _calculatePDAAccounts(mintAccount) {
    // 计算曲线账户 PDA
    const [curveAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('borrowing_curve'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    // 计算池子代币账户 PDA
    const [poolTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_token'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    // 计算池子 SOL 账户 PDA
    const [poolSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_sol'), mintAccount.toBuffer()],
      this.sdk.programId
    );

    return {
      curveAccount,
      poolTokenAccount,
      poolSolAccount
    };
  }



  /**
   * 构建订单账户参数
   * @private
   * @param {Array} orderAccounts - 订单账户数组
   * @returns {Object} 订单账户参数对象
   */
  _buildOrderAccountsParams(orderAccounts) {
    const params = {};

    for (let i = 0; i < this.sdk.MAX_ORDERS_COUNT; i++) {
      const account = orderAccounts[i];
      params[`order${i}`] = account ? new PublicKey(account) : null;
      //console.log("_buildOrderAccountsParams order",i,account);
    }

    return params;
  }
}

module.exports = TradingModule;
