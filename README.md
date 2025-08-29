# SpinPetSdk Interface Documentation

This is a detailed interface documentation for the SpinPetSdk class, providing developers with a clear and comprehensive API usage guide.

## Table of Contents

1. [SDK Initialization](#sdk-initialization)
2. [Core Configuration](#core-configuration)
3. [Trading Module - Trading Functions](#trading-module---trading-functions)
4. [Fast Module - Data Retrieval](#fast-module---data-retrieval)
5. [Token Module - Token Management](#token-module---token-management)
6. [Param Module - Parameter Management](#param-module---parameter-management)
7. [Simulator Module - Trading Simulation](#simulator-module---trading-simulation)
8. [Chain Module - On-chain Data Queries](#chain-module---on-chain-data-queries)
9. [Utility Methods](#utility-methods)

---

## SDK Initialization

### Constructor

```javascript
new SpinPetSdk(connection, wallet, programId, options)
```

**Parameters:**
- `connection` *(Connection)*: Solana connection instance
- `wallet` *(Wallet|Keypair)*: Wallet instance or keypair
- `programId` *(PublicKey|string)*: Program ID
- `options` *(Object)*: Optional configuration parameters

**Options configuration:**
```javascript
{
  fee_recipient: "4nffmKaNrex34LkJ99RLxMt2BbgXeopUi8kJnom3YWbv",           // Fee recipient account
  base_fee_recipient: "8fJpd2nteqkTEnXf4tG6d1MnP9p71KMCV4puc9vaq6kv",      // Base fee recipient account
  params_account: "DVRnPDW1MvUhRhDfE1kU6aGHoQoufBCmQNbqUH4WFgUd",          // Parameters account
  spin_fast_api_url: "http://192.168.18.36:8080",                         // FastAPI address
  commitment: "confirmed",                                                 // Commitment level
  preflightCommitment: "processed",                                        // Preflight commitment level
  skipPreflight: false,                                                    // Whether to skip preflight
  maxRetries: 3                                                           // Maximum retry attempts
}
```

**Example:**
```javascript
const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const SpinPetSdk = require('spinpet-sdk');

// Create connection
const connection = new Connection('http://localhost:8899', 'confirmed');

// Create wallet
const wallet = new anchor.Wallet(keypair);

// Initialize SDK
const sdk = new SpinPetSdk(
  connection, 
  wallet, 
  "YourProgramId", 
  {
    fee_recipient: "4nffmKaNrex34LkJ99RLxMt2BbgXeopUi8kJnom3YWbv",
    base_fee_recipient: "8fJpd2nteqkTEnXf4tG6d1MnP9p71KMCV4puc9vaq6kv",
    params_account: "DVRnPDW1MvUhRhDfE1kU6aGHoQoufBCmQNbqUH4WFgUd",
    spin_fast_api_url: "http://localhost:8080"
  }
);
```

---

## Core Configuration

### Constant Configuration

- `sdk.MAX_ORDERS_COUNT`: 20 - Maximum number of orders processed per transaction
- `sdk.FIND_MAX_ORDERS_COUNT`: 1000 - Maximum number of orders retrieved during queries

---

## Trading Module - Trading Functions

### sdk.trading.buy() - Buy Tokens

```javascript
await sdk.trading.buy(params, options)
```

**Parameters:**
- `params.mintAccount` *(string|PublicKey)*: Token mint account address
- `params.buyTokenAmount` *(anchor.BN)*: Amount of tokens to buy
- `params.maxSolAmount` *(anchor.BN)*: Maximum SOL to spend
- `params.payer` *(PublicKey)*: Payer public key
- `options.computeUnits` *(number)*: Compute unit limit, default 1400000

**Return value:**
```javascript
{
  transaction: Transaction,           // Transaction object
  signers: [],                       // Signers array (empty, only payer signature needed)
  accounts: {                        // Related account information
    mint: PublicKey,
    curveAccount: PublicKey,
    poolTokenAccount: PublicKey,
    poolSolAccount: PublicKey,
    userTokenAccount: PublicKey,
    payer: PublicKey
  },
  orderData: {                       // Order data information
    ordersUsed: number,              // Number of orders used
    lpPairsCount: number,            // Number of LP pairs
    lpPairs: Array,                  // LP pairs array
    orderAccounts: Array             // Order accounts array
  }
}
```

**Example:**
```javascript
const result = await sdk.trading.buy({
  mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
  buyTokenAmount: new anchor.BN("1000000000"),    // 1 token (assuming 9 decimals)
  maxSolAmount: new anchor.BN("2000000000"),      // 2 SOL
  payer: wallet.publicKey
});

// Sign and send transaction
const signature = await connection.sendTransaction(result.transaction, [wallet.payer]);
```

### sdk.trading.sell() - Sell Tokens

```javascript
await sdk.trading.sell(params, options)
```

**Parameters:**
- `params.mintAccount` *(string|PublicKey)*: Token mint account address
- `params.sellTokenAmount` *(anchor.BN)*: Amount of tokens to sell
- `params.minSolOutput` *(anchor.BN)*: Minimum SOL output
- `params.payer` *(PublicKey)*: Payer public key
- `options.computeUnits` *(number)*: Compute unit limit, default 1400000

**Return value:** Same as `buy()` method

**Example:**
```javascript
const result = await sdk.trading.sell({
  mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
  sellTokenAmount: new anchor.BN("1000000000"),   // 1 token
  minSolOutput: new anchor.BN("1800000000"),      // At least 1.8 SOL
  payer: wallet.publicKey
});
```

### sdk.trading.long() - Margin Long

```javascript
await sdk.trading.long(params, options)
```

**Parameters:**
- `params.mintAccount` *(string|PublicKey)*: Token mint account address
- `params.buyTokenAmount` *(anchor.BN)*: Amount of tokens to buy
- `params.maxSolAmount` *(anchor.BN)*: Maximum SOL to spend
- `params.marginSol` *(anchor.BN)*: Margin amount
- `params.closePrice` *(anchor.BN)*: Close price
- `params.prevOrder` *(PublicKey|null)*: Previous order
- `params.nextOrder` *(PublicKey|null)*: Next order
- `params.payer` *(PublicKey)*: Payer public key
- `options.computeUnits` *(number)*: Compute unit limit, default 1400000

**Return value:**
```javascript
{
  transaction: Transaction,
  signers: [],
  accounts: {
    mint: PublicKey,
    curveAccount: PublicKey,
    poolTokenAccount: PublicKey,
    poolSolAccount: PublicKey,
    payer: PublicKey,
    selfOrder: PublicKey               // Self-created order address
  },
  orderData: {
    ordersUsed: number,
    lpPairsCount: number,
    lpPairs: Array,
    orderAccounts: Array,
    uniqueSeed: anchor.BN,             // Unique seed
    prevOrder: PublicKey|null,
    nextOrder: PublicKey|null
  }
}
```

**Example:**
```javascript
const result = await sdk.trading.long({
  mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
  buyTokenAmount: new anchor.BN("10000000"),      // 0.01 token
  maxSolAmount: new anchor.BN("1100000000"),      // Max spend 1.1 SOL
  marginSol: new anchor.BN("2200000000"),         // Margin 2.2 SOL
  closePrice: new anchor.BN("1000000000000000"),  // Close price
  prevOrder: null,
  nextOrder: null,
  payer: wallet.publicKey
});
```

### sdk.trading.short() - Margin Short

```javascript
await sdk.trading.short(params, options)
```

**Parameters:**
- `params.mintAccount` *(string|PublicKey)*: Token mint account address
- `params.borrowSellTokenAmount` *(anchor.BN)*: Amount of borrowed tokens to sell
- `params.minSolOutput` *(anchor.BN)*: Minimum SOL output
- `params.marginSol` *(anchor.BN)*: Margin amount
- `params.closePrice` *(anchor.BN)*: Close price
- `params.prevOrder` *(PublicKey|null)*: Previous order
- `params.nextOrder` *(PublicKey|null)*: Next order
- `params.payer` *(PublicKey)*: Payer public key
- `options.computeUnits` *(number)*: Compute unit limit, default 1400000

**Return value:** Similar to `long()` method

**Example:**
```javascript
const result = await sdk.trading.short({
  mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
  borrowSellTokenAmount: new anchor.BN("1000000000"),  // Borrow and sell 1 token
  minSolOutput: new anchor.BN("100"),                   // At least 0.0000001 SOL
  marginSol: new anchor.BN("2200000000"),               // Margin 2.2 SOL
  closePrice: new anchor.BN("1000000000000000"),        // Close price
  prevOrder: null,
  nextOrder: null,
  payer: wallet.publicKey
});
```

### sdk.trading.closeLong() - Close Long Position

```javascript
await sdk.trading.closeLong(params, options)
```

**Parameters:**
- `params.mintAccount` *(string|PublicKey)*: Token mint account address
- `params.closeOrder` *(string|PublicKey)*: Order address to close
- `params.lpPairs` *(Array)*: LP pairs array
- `params.sellTokenAmount` *(anchor.BN)*: Amount of tokens to sell
- `params.minSolOutput` *(anchor.BN)*: Minimum SOL output after selling
- `params.payer` *(PublicKey)*: Payer public key
- `options.computeUnits` *(number)*: Compute unit limit, default 1400000

**Example:**
```javascript
// First get order data
const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
const lpPairs = sdk.fast.buildLpPairs(ordersData.data.orders);

const result = await sdk.trading.closeLong({
  mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
  closeOrder: "E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA",
  lpPairs: lpPairs,
  sellTokenAmount: new anchor.BN("1000000000"),
  minSolOutput: new anchor.BN("100000000"),
  payer: wallet.publicKey
});
```

### sdk.trading.closeShort() - Close Short Position

```javascript
await sdk.trading.closeShort(params, options)
```

**Parameters:**
- `params.mintAccount` *(string|PublicKey)*: Token mint account address
- `params.closeOrder` *(string|PublicKey)*: Order address to close
- `params.lpPairs` *(Array)*: LP pairs array
- `params.buyTokenAmount` *(anchor.BN)*: Amount of tokens to buy
- `params.maxSolAmount` *(anchor.BN)*: Maximum SOL to spend
- `params.payer` *(PublicKey)*: Payer public key
- `options.computeUnits` *(number)*: Compute unit limit, default 1400000

**Example:**
```javascript
// First get order data
const ordersData = await sdk.fast.orders(mint, { type: 'up_orders' });
const lpPairs = sdk.fast.buildLpPairs(ordersData.data.orders);

const result = await sdk.trading.closeShort({
  mintAccount: "HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7",
  closeOrder: "E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA",
  lpPairs: lpPairs,
  buyTokenAmount: new anchor.BN("1000000000"),
  maxSolAmount: new anchor.BN("100000000"),
  payer: wallet.publicKey
});
```

---

## Fast Module - Data Retrieval

### sdk.fast.mints() - Get Token List

```javascript
await sdk.fast.mints(options)
```

**Parameters:**
- `options.page` *(number)*: Page number, default 1
- `options.limit` *(number)*: Items per page, default 10
- `options.sort_by` *(string)*: Sort method, default 'slot_asc'

**Return value:**
```javascript
{
  "success": true,
  "data": {
    "mints": ["56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg", "4RGUZQ7PGF2JQWXKxr9hybPs1ZY3LWDb4QQ7FSHx92g9"],
    "total": null,
    "page": 1,
    "limit": 10,
    "has_next": false,
    "has_prev": false,
    "next_cursor": null,
    "sort_by": "slot_asc"
  },
  "message": "Operation successful"
}
```

**Example:**
```javascript
const result = await sdk.fast.mints({ page: 1, limit: 10 });
const mintAddresses = result.data.mints; // Token address array
```

### sdk.fast.mint_info() - Get Token Details

```javascript
await sdk.fast.mint_info(mint)
```

**Parameters:**
- `mint` *(string|Array)*: Token address or array of addresses

**Return value:**
```javascript
{
  "success": true,
  "data": {
    "details": [
      {
        "mint_account": "56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg",
        "payer": "Hfi9FpHeqAz8qih87NccCqRQY7VWs3JH8ixqqBXRBLH5",
        "curve_account": "4xPzWMvbGT2AMmCMcvCw3h3PA3iG6kNKixfJyZ45r2BA",
        "pool_token_account": "7FsTN832wYsfa1fThy4sKZiMNavVRJ6gPk3SXbEwcAXH",
        "pool_sol_account": "3j4PfGm7YNhpBLijBHgNXggvVzsDMYTJW5fNJQ6cV89N",
        "name": "Hello",
        "symbol": "HLO",
        "uri": "https://example.com/hello-token.json",
        "swap_fee": 250,
        "borrow_fee": 300,
        "fee_discount_flag": 2,
        "create_timestamp": 1755667440,
        "latest_price": "13514066072452801812769",
        "latest_trade_time": 1755667451,
        "total_sol_amount": 214303125000,
        "total_margin_sol_amount": 5837102249,
        "total_force_liquidations": 4,
        "total_close_profit": 1605153562,
        "created_by": "Hfi9FpHeqAz8qih87NccCqRQY7VWs3JH8ixqqBXRBLH5",
        "last_updated_at": "2025-08-20T05:24:12.327211706Z"
      }
    ],
    "total": 1
  },
  "message": "Operation successful"
}
```

**Example:**
```javascript
// Get single token details
const info = await sdk.fast.mint_info('56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg');
const details = info.data.details[0];

// Get multiple token details
const info = await sdk.fast.mint_info(['address1', 'address2']);
```

### sdk.fast.orders() - Get Order Data

```javascript
await sdk.fast.orders(mint, options)
```

**Parameters:**
- `mint` *(string)*: Token address
- `options.type` *(string)*: Order type, "up_orders" (short) or "down_orders" (long)
- `options.page` *(number)*: Page number, default 1
- `options.limit` *(number)*: Items per page, default 500

**Return value:**
```javascript
{
  "success": true,
  "data": {
    "orders": [
      {
        "order_type": 2,
        "mint": "Token address",
        "user": "User address",
        "lock_lp_start_price": "753522984132656210522",
        "lock_lp_end_price": "833102733432007194898",
        "lock_lp_sol_amount": 2535405978,
        "lock_lp_token_amount": 32000000000000,
        "start_time": 1755964862,
        "end_time": 1756137662,
        "margin_sol_amount": 1909140052,
        "borrow_amount": 32000000000000,
        "position_asset_amount": 656690798,
        "borrow_fee": 1200,
        "order_pda": "59yP5tpDP6DBcyy4mge9wKKKdLmk45Th4sbd6Un9LxVN"
      }
    ],
    // ... more orders
  }
}
```

**Example:**
```javascript
// Get long orders
const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
const orders = ordersData.data.orders;
```

### sdk.fast.price() - Get Token Price

```javascript
await sdk.fast.price(mint)
```

**Parameters:**
- `mint` *(string)*: Token address

**Return value:**
- `string`: Latest price string

**Example:**
```javascript
// Get latest token price
const price = await sdk.fast.price('56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg');
console.log('Latest price:', price); // "13514066072452801812769"
```

### sdk.fast.user_orders() - Get User Orders

```javascript
await sdk.fast.user_orders(user, mint, options)
```

**Parameters:**
- `user` *(string)*: User address
- `mint` *(string)*: Token address
- `options.page` *(number)*: Page number, default 1
- `options.limit` *(number)*: Items per page, default 200
- `options.order_by` *(string)*: Sort method, default 'start_time_desc'

**Example:**
```javascript
const userOrders = await sdk.fast.user_orders(
  '8iGFeUkRpyRx8w5uoUMbfZepUr6BfTdPuJmqGoNBntdb',
  '4Kq51Kt48FCwdo5CeKjRVPodH1ticHa7mZ5n5gqMEy1X',
  { page: 1, limit: 200 }
);
const orders = userOrders.data.orders;
```

### sdk.fast.findPrevNext() - Find Order Previous and Next Nodes

```javascript
sdk.fast.findPrevNext(orders, findOrderPda)
```

**Parameters:**
- `orders` *(Array)*: Orders array
- `findOrderPda` *(string)*: Order PDA address to find

**Return value:**
```javascript
{
  prevOrder: Object|null,    // Previous order
  nextOrder: Object|null     // Next order
}
```

**Example:**
```javascript
const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
const result = sdk.fast.findPrevNext(ordersData.data.orders, 'E2T72D4wZdxHRjELN5VnRdcCvS4FPcYBBT3UBEoaC5cA');

if (result.prevOrder) {
  console.log('Previous order:', result.prevOrder.order_pda);
}
```

### sdk.fast.buildLpPairs() - Build LP Pairs Array

```javascript
sdk.fast.buildLpPairs(orders)
```

**Parameters:**
- `orders` *(Array)*: Orders array

**Return value:**
```javascript
[
  { solAmount: anchor.BN, tokenAmount: anchor.BN },
  { solAmount: anchor.BN, tokenAmount: anchor.BN },
  // ... up to 20 pairs
]
```

**Example:**
```javascript
const ordersData = await sdk.fast.orders(mint, { type: 'down_orders' });
const lpPairs = sdk.fast.buildLpPairs(ordersData.data.orders);
```

### sdk.fast.buildOrderAccounts() - Build Order Accounts Array

```javascript
sdk.fast.buildOrderAccounts(orders)
```

**Parameters:**
- `orders` *(Array)*: Orders array

**Return value:**
```javascript
[
  "4fvsPDNoRRacSzE3PkEuNQeTNWMaeFqGwUxCnEbR1Dzb",  // Order address
  "G4nHBYX8EbrP8r35pk5TfpvJZfGNyLnd4qsfT7ru5vLd",  // Order address
  // ...
  null,  // Empty slot
  null   // Empty slot (total 20 slots)
]
```

---

## Token Module - Token Management

### sdk.token.create() - Create New Token

```javascript
await sdk.token.create(params)
```

**Parameters:**
- `params.mint` *(Keypair)*: Token mint keypair
- `params.name` *(string)*: Token name
- `params.symbol` *(string)*: Token symbol
- `params.uri` *(string)*: Metadata URI
- `params.payer` *(PublicKey)*: Creator public key

**Return value:**
```javascript
{
  transaction: Transaction,
  signers: [Keypair],           // mint keypair needs to be a signer
  accounts: {
    mint: PublicKey,
    curveAccount: PublicKey,
    poolTokenAccount: PublicKey,
    poolSolAccount: PublicKey,
    payer: PublicKey
  }
}
```

**Example:**
```javascript
const { Keypair } = require('@solana/web3.js');

const mintKeypair = Keypair.generate();
const result = await sdk.token.create({
  mint: mintKeypair,
  name: "My Token",
  symbol: "MTK",
  uri: "https://example.com/token-metadata.json",
  payer: wallet.publicKey
});

// Sign and send (requires both payer and mint signatures)
const signature = await connection.sendTransaction(
  result.transaction, 
  [wallet.payer, mintKeypair]
);
```

---

## Param Module - Parameter Management

### sdk.param.createParams() - Create Partner Parameters

```javascript
await sdk.param.createParams(params)
```

**Parameters:**
- `params.partner` *(PublicKey)*: Partner public key

**Return value:**
```javascript
{
  transaction: Transaction,
  signers: [],                  // No additional signers needed
  accounts: {
    partner: PublicKey,
    adminAccount: PublicKey,
    paramsAccount: PublicKey
  }
}
```

**Example:**
```javascript
const result = await sdk.param.createParams({
  partner: partnerPublicKey
});
```

### sdk.param.getParams() - Get Partner Parameters

```javascript
await sdk.param.getParams(partner)
```

**Parameters:**
- `partner` *(PublicKey)*: Partner public key

**Return value:**
```javascript
{
  address: PublicKey,           // Parameter account address
  data: Object                  // Parameter data
}
```

### sdk.param.getAdmin() - Get Admin Account

```javascript
await sdk.param.getAdmin()
```

**Return value:**
```javascript
{
  address: PublicKey,           // Admin account address
  data: Object                  // Admin data
}
```

### sdk.param.getParamsAddress() - Calculate Parameter Account Address

```javascript
sdk.param.getParamsAddress(partner)
```

**Parameters:**
- `partner` *(PublicKey)*: Partner public key

**Return value:** *(PublicKey)* - Parameter account address

### sdk.param.getAdminAddress() - Calculate Admin Account Address

```javascript
sdk.param.getAdminAddress()
```

**Return value:** *(PublicKey)* - Admin account address

---

## Simulator Module - Trading Simulation

### sdk.simulator.simulateBuy() - Simulate Buy Analysis

```javascript
await sdk.simulator.simulateBuy(mint, buySolAmount)
```

**Parameters:**
- `mint` *(string)*: Token address
- `buySolAmount` *(bigint|string|number)*: SOL amount to buy (u64 format, precision 10^9)

**Return value:**
```javascript
{
  success: boolean,
  estimatedTokenOutput: string,     // Estimated tokens to receive
  priceImpact: string,             // Price impact percentage
  fees: {
    swapFee: string,               // Swap fee
    totalFee: string               // Total fee
  },
  // ... more analysis data
}
```

**Example:**
```javascript
const analysis = await sdk.simulator.simulateBuy(
  '56hfrQYiyRSUZdRKDuUvsqRik8j2UDW9kCisy7BiRxmg',
  '1000000000'  // 1 SOL
);
```

### sdk.simulator.simulateSell() - Simulate Sell Analysis

```javascript
await sdk.simulator.simulateSell(mint, sellTokenAmount)
```

**Parameters:**
- `mint` *(string)*: Token address
- `sellTokenAmount` *(bigint|string|number)*: Token amount to sell (u64 format, precision 10^6)

**Return value:** Similar to `simulateBuy()`

### sdk.simulator.simulateLongStopLoss() - Simulate Long Stop Loss

```javascript
await sdk.simulator.simulateLongStopLoss(mint, buyTokenAmount, stopLossPrice, mintInfo, ordersData)
```

**Parameters:**
- `mint` *(string)*: Token address
- `buyTokenAmount` *(bigint|string|number)*: Token amount to buy for long position
- `stopLossPrice` *(bigint|string|number)*: User desired stop loss price
- `mintInfo` *(Object|null)*: Token info, default null
- `ordersData` *(Object|null)*: Orders data, default null

**Return value:**
```javascript
{
  success: boolean,
  stopLossAnalysis: {
    canSetStopLoss: boolean,        // Whether stop loss can be set
    recommendedPrice: string,       // Recommended stop loss price
    riskLevel: string,              // Risk level
    // ... more analysis data
  }
}
```

### sdk.simulator.simulateSellStopLoss() - Simulate Short Stop Loss

```javascript
await sdk.simulator.simulateSellStopLoss(mint, sellTokenAmount, stopLossPrice, mintInfo, ordersData)
```

**Parameters:** Similar to `simulateLongStopLoss()`

---

## Chain Module - On-chain Data Queries

The Chain module provides functionality to read account data directly from the Solana blockchain. When no auxiliary server is available, this module can be used to retrieve real-time on-chain data, including liquidity pool status and account balances.

**Features:**
- = **Direct on-chain queries**: Read data directly from blockchain without relying on third-party APIs
- ¡ **Concurrent optimization**: Use Promise.all for concurrent account queries to improve performance
- =Ê **Complete data**: Return comprehensive information including all related account addresses and balances
- =á **Error handling**: Provide detailed error messages and exception handling
- = **Real-time sync**: Data is synchronized with on-chain state in real-time for accuracy

**Important notes:**
- During peak trading periods, on-chain queries may experience delays
- It's recommended to use Fast module API interfaces for critical trading scenarios
- Chain module is suitable for monitoring, analysis, and non-real-time trading scenarios

### sdk.chain.getCurveAccount() - Get Complete Liquidity Pool Data

This is the core method of the Chain module, used to retrieve complete borrowing liquidity pool account data for a specified token.

```javascript
await sdk.chain.getCurveAccount(mint)
```

**Parameters:**
- `mint` *(string|PublicKey)*: Token mint account address

**Return value:**
```javascript
{
  // Core Reserve Data
  lpTokenReserve: bigint,              // LP Token reserves, total reserves of liquidity provider tokens
  lpSolReserve: bigint,                // LP SOL reserves, SOL reserves in the liquidity pool
  price: bigint,                       // Current token price, calculated based on AMM algorithm
  borrowTokenReserve: bigint,          // Borrowable Token reserves, borrowable token reserves
  borrowSolReserve: bigint,            // Borrowable SOL reserves, borrowable SOL reserves

  // Fee and Parameter Configuration
  swapFee: number,                     // Swap fee rate, expressed in basis points (e.g. 100 = 1%)
  borrowFee: number,                   // Borrow fee rate, expressed in basis points
  feeDiscountFlag: boolean,            // Fee discount flag, whether fee discounts are enabled
  feeSplit: number,                    // Fee split ratio, determines how fees are distributed
  borrowDuration: number,              // Borrow duration, in seconds
  bump: number,                        // curve_account PDA bump seed

  // Account Addresses
  baseFeeRecipient: string,            // Base fee recipient address, receives base transaction fees
  feeRecipient: string,                // Fee recipient address, receives additional fee income
  mint: string,                        // Token mint account address
  upHead: string|null,                 // Up order linked list head account address, null if none
  downHead: string|null,               // Down order linked list head account address, null if none
  poolTokenAccount: string,            // Pool token account address, stores tokens in the liquidity pool
  poolSolAccount: string,              // Pool SOL account address, stores native SOL in the liquidity pool

  // Balance Information
  baseFeeRecipientBalance: number,     // SOL balance of base fee recipient address (lamports)
  feeRecipientBalance: number,         // SOL balance of fee recipient address (lamports)
  poolTokenBalance: bigint,            // Token balance of pool token account
  poolSolBalance: number,              // SOL balance of pool SOL account (lamports)

  // Metadata
  _metadata: {
    accountAddress: string,            // Complete address of curve_account
    mintAddress: string                // Input token mint address
  }
}
```

**Complete example:**
```javascript
try {
  // Get complete liquidity pool data
  const curveData = await sdk.chain.getCurveAccount('3YggGtxXEGBbjK1WLj2Z79doZC2gkCWXag1ag8BD4cYY');
  
  // === Display core reserve information ===
  console.log('=== Core Reserve Data ===');
  console.log('LP Token reserves:', curveData.lpTokenReserve.toString());
  console.log('LP SOL reserves:', (Number(curveData.lpSolReserve) / 1e9).toFixed(4), 'SOL');
  console.log('Current price:', curveData.price.toString());
  console.log('Borrow Token reserves:', curveData.borrowTokenReserve.toString());
  console.log('Borrow SOL reserves:', (Number(curveData.borrowSolReserve) / 1e9).toFixed(4), 'SOL');
  
  // === Display fee configuration ===
  console.log('=== Fee Configuration ===');
  console.log('Swap fee rate:', (curveData.swapFee / 100).toFixed(2), '%');
  console.log('Borrow fee rate:', (curveData.borrowFee / 100).toFixed(2), '%');
  console.log('Fee discount:', curveData.feeDiscountFlag ? 'Enabled' : 'Disabled');
  console.log('Fee split ratio:', curveData.feeSplit);
  console.log('Borrow duration:', curveData.borrowDuration, 'seconds');
  
  // === Display account addresses ===
  console.log('=== Account Addresses ===');
  console.log('Base fee recipient address:', curveData.baseFeeRecipient);
  console.log('Fee recipient address:', curveData.feeRecipient);
  console.log('Pool token account:', curveData.poolTokenAccount);
  console.log('Pool SOL account:', curveData.poolSolAccount);
  
  // === Display balance information ===
  console.log('=== Balance Information ===');
  console.log('Base fee recipient balance:', (curveData.baseFeeRecipientBalance / 1e9).toFixed(6), 'SOL');
  console.log('Fee recipient balance:', (curveData.feeRecipientBalance / 1e9).toFixed(6), 'SOL');
  console.log('Pool token balance:', curveData.poolTokenBalance.toString());
  console.log('Pool SOL balance:', (curveData.poolSolBalance / 1e9).toFixed(6), 'SOL');
  
  // === Display linked list head information ===
  console.log('=== Order Linked Lists ===');
  console.log('Up order head:', curveData.upHead || 'Empty');
  console.log('Down order head:', curveData.downHead || 'Empty');
  
} catch (error) {
  console.error('Failed to get curve account:', error.message);
}
```

**Liquidity pool monitoring example:**
```javascript
// Utility function to monitor liquidity pool health
async function monitorPoolHealth(mintAddress) {
  try {
    const data = await sdk.chain.getCurveAccount(mintAddress);
    
    // Calculate pool utilization
    const tokenUtilization = Number(data.lpTokenReserve - data.poolTokenBalance) / Number(data.lpTokenReserve);
    const solUtilization = Number(data.lpSolReserve - BigInt(data.poolSolBalance)) / Number(data.lpSolReserve);
    
    // Calculate total fee earnings
    const totalFeeBalance = data.baseFeeRecipientBalance + data.feeRecipientBalance;
    
    // Assess liquidity status
    const liquidityStatus = {
      tokenUtilization: (tokenUtilization * 100).toFixed(2) + '%',
      solUtilization: (solUtilization * 100).toFixed(2) + '%',
      totalFeeEarnings: (totalFeeBalance / 1e9).toFixed(6) + ' SOL',
      currentPrice: data.price.toString(),
      isHealthy: tokenUtilization < 0.9 && solUtilization < 0.9,  // Healthy if utilization < 90%
      hasOrders: Boolean(data.upHead || data.downHead)
    };
    
    console.log('Liquidity pool health status:', liquidityStatus);
    
    return liquidityStatus;
    
  } catch (error) {
    console.error('Monitoring failed:', error.message);
    return null;
  }
}

// Batch monitor multiple token liquidity pools
async function batchMonitorPools(mintAddresses) {
  const results = await Promise.allSettled(
    mintAddresses.map(mint => monitorPoolHealth(mint))
  );
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      console.log(`Token ${mintAddresses[index]}:`, result.value);
    } else {
      console.error(`Token ${mintAddresses[index]} monitoring failed`);
    }
  });
}
```

### sdk.chain.getCurveAccountBatch() - Batch Get Liquidity Pool Data

```javascript
await sdk.chain.getCurveAccountBatch(mints)
```

**Parameters:**
- `mints` *(Array<string|PublicKey>)*: Array of token addresses

**Return value:**
```javascript
{
  success: Array,                      // Array of successfully retrieved data
  errors: Array,                       // Array of error information for failures
  total: number,                       // Total count
  successCount: number,                // Success count
  errorCount: number                   // Error count
}
```

**Example:**
```javascript
const curveDataList = await sdk.chain.getCurveAccountBatch([
  '3YggGtxXEGBbjK1WLj2Z79doZC2gkCWXag1ag8BD4cYY',
  'HZBos3RNhExDcAtzmdKXhTd4sVcQFBiT3FDBgmBBMk7'
]);

console.log('Successfully retrieved:', curveDataList.successCount);
console.log('Failed count:', curveDataList.errorCount);
curveDataList.success.forEach(data => {
  console.log('Token:', data.mint, 'Price:', data.price.toString());
});
```

### sdk.chain.getCurveAccountAddress() - Calculate Liquidity Pool Address

```javascript
sdk.chain.getCurveAccountAddress(mint)
```

**Parameters:**
- `mint` *(string|PublicKey)*: Token mint account address

**Return value:** *(PublicKey)* - curve_account PDA address

**Example:**
```javascript
const curveAddress = sdk.chain.getCurveAccountAddress('3YggGtxXEGBbjK1WLj2Z79doZC2gkCWXag1ag8BD4cYY');
console.log('Curve Account Address:', curveAddress.toString());
```

**Chain Module Use Cases:**

1. **Real-time monitoring**: Monitor liquidity pool status, balance changes, fee earnings
2. **Data analysis**: Analyze price trends, utilization rates, trading activity
3. **Risk management**: Check liquidity health status, identify abnormal situations
4. **Development debugging**: Verify contract state and data correctness during development
5. **Offline analysis**: Retrieve historical data for subsequent analysis and reporting

**Performance optimization suggestions:**

- Use batch query methods to reduce network requests
- Consider using Fast module APIs for high-frequency query scenarios
- Set reasonable query intervals to avoid overly frequent on-chain queries
- Use error retry mechanisms to handle network fluctuations

---

## Utility Methods

### Network Configuration

```javascript
const { getDefaultOptions } = require('spinpet-sdk/src/utils/constants');

// Get default configuration
const options = getDefaultOptions('MAINNET');  // 'MAINNET' | 'TESTNET' | 'LOCALNET'
```

**Available networks:**
- `MAINNET`: Mainnet configuration
- `TESTNET`: Testnet configuration  
- `LOCALNET`: Local network configuration

---

## Complete Usage Example

```javascript
const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const SpinPetSdk = require('spinpet-sdk');
const { getDefaultOptions } = require('spinpet-sdk/src/utils/constants');

async function example() {
  // 1. Create connection and wallet
  const connection = new Connection('http://localhost:8899', 'confirmed');
  const wallet = new anchor.Wallet(keypair);
  
  // 2. Get default configuration
  const options = getDefaultOptions('LOCALNET');
  
  // 3. Initialize SDK
  const sdk = new SpinPetSdk(connection, wallet, programId, options);
  
  // 4. Use various functions
  
  // Get token list
  const mints = await sdk.fast.mints();
  console.log('Token list:', mints.data.mints);
  
  // Get token details
  const mintInfo = await sdk.fast.mint_info(mints.data.mints[0]);
  console.log('Token details:', mintInfo.data.details[0]);
  
  // Simulate buy
  const buyAnalysis = await sdk.simulator.simulateBuy(
    mints.data.mints[0], 
    '1000000000'  // 1 SOL
  );
  console.log('Buy analysis:', buyAnalysis);
  
  // Execute buy transaction
  const buyResult = await sdk.trading.buy({
    mintAccount: mints.data.mints[0],
    buyTokenAmount: new anchor.BN("1000000000"),
    maxSolAmount: new anchor.BN("2000000000"),
    payer: wallet.publicKey
  });
  
  // Sign and send transaction
  const signature = await connection.sendTransaction(buyResult.transaction, [wallet.payer]);
  console.log('Transaction signature:', signature);
}
```

---

## Important Notes

1. **Numerical precision**: All amount-related parameters need to use `anchor.BN` type. Note that SOL precision is 10^9, token precision is usually 10^6 or 10^9.

2. **Transaction signing**: The `transaction` object returned by SDK needs to be signed and sent by the user. SDK does not automatically execute transactions.

3. **Order queries**: Before executing close operations, you need to first get order data through `sdk.fast.orders()` and process it with utility methods.

4. **Network configuration**: Different network environments require corresponding configuration parameters. It's recommended to use `getDefaultOptions()` to get them.

5. **Error handling**: All async methods may throw exceptions. It's recommended to use try-catch for error handling.