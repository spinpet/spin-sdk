/**
 * SpinPet SDK 工厂
 * 统一管理SDK实例的创建和配置
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { SpinPetSdk, getDefaultOptions, SPINPET_PROGRAM_ID } = require('../src/index');
const { getWalletByIndex } = require('../test-tools/wallets');
const BotGlobal = require('./bot-global');
const bs58 = require('bs58');
const anchor = require('@coral-xyz/anchor');

// SDK实例缓存
let cachedSdk = null;
let cachedConnection = null;
let cachedWallet = null;

/**
 * 获取或创建Solana连接
 * @param {string} network - 网络类型 
 * @returns {Connection} Solana连接实例
 */
function getConnection(network = 'LOCALNET') {
  if (!cachedConnection) {
    const options = getDefaultOptions(network);
    cachedConnection = new Connection(options.solanaEndpoint, 'confirmed');
    BotGlobal.logMessage('info', `已创建Solana连接: ${options.solanaEndpoint}`);
  }
  return cachedConnection;
}

/**
 * 获取或创建钱包
 * @param {number} walletIndex - 钱包索引
 * @returns {Object} 包含keypair和wallet的对象
 */
function getWallet(walletIndex = 0) {
  if (!cachedWallet) {
    const walletInfo = getWalletByIndex(walletIndex);
    if (!walletInfo) {
      throw new Error(`无法获取钱包索引 ${walletIndex} 的信息`);
    }
    
    const walletKeypair = Keypair.fromSecretKey(
      bs58.decode(walletInfo.privateKey)
    );
    
    const wallet = new anchor.Wallet(walletKeypair);
    
    cachedWallet = {
      keypair: walletKeypair,
      wallet: wallet,
      info: walletInfo
    };
    
    BotGlobal.logMessage('info', `已创建钱包实例: ${walletKeypair.publicKey.toString()}`);
    BotGlobal.logMessage('info', `钱包余额: ${walletInfo.balance} SOL`);
  }
  
  return cachedWallet;
}

/**
 * 获取或创建SpinPet SDK实例
 * @param {Object} options - 选项参数
 * @returns {SpinPetSdk} SDK实例
 */
function getSdk(options = {}) {
  const config = BotGlobal.getConfig();
  
  // 如果配置没有变化且SDK已存在，直接返回缓存的实例
  if (cachedSdk && 
      options.network === config.network && 
      options.walletIndex === config.walletIndex) {
    BotGlobal.logMessage('info', 'SDK实例已存在，使用缓存');
    return {
      sdk: cachedSdk,
      connection: cachedConnection,
      wallet: cachedWallet
    };
  }
  
  // 清除旧的缓存
  if (cachedSdk) {
    BotGlobal.logMessage('info', '配置变化，清除旧的SDK缓存');
    clearCache();
  }
  
  // 获取网络配置
  const network = options.network || config.network;
  const walletIndex = options.walletIndex !== undefined ? options.walletIndex : config.walletIndex;
  
  BotGlobal.logMessage('info', '正在初始化SpinPet SDK...');
  BotGlobal.logMessage('info', `网络: ${network}`);
  BotGlobal.logMessage('info', `钱包索引: ${walletIndex}`);
  
  try {
    // 获取连接和钱包
    const connection = getConnection(network);
    const walletObj = getWallet(walletIndex);
    
    // 获取网络选项
    const networkOptions = getDefaultOptions(network);
    BotGlobal.logMessage('info', `网络选项: ${JSON.stringify(networkOptions)}`);
    
    // 创建SDK实例
    const sdk = new SpinPetSdk(
      connection,
      new PublicKey(SPINPET_PROGRAM_ID),
      networkOptions
    );
    
    // 缓存实例
    cachedSdk = sdk;
    
    BotGlobal.logMessage('info', 'SpinPet SDK 初始化完成');
    BotGlobal.logMessage('info', `程序 ID: ${sdk.programId.toString()}`);
    BotGlobal.logMessage('info', `程序对象存在: ${!!sdk.program}`);
    
    return {
      sdk: sdk,
      connection: connection,
      wallet: walletObj
    };
    
  } catch (error) {
    BotGlobal.logMessage('error', `SDK初始化失败: ${error.message}`);
    throw error;
  }
}

/**
 * 清除SDK缓存
 * 在网络或钱包配置变化时调用
 */
function clearCache() {
  cachedSdk = null;
  cachedConnection = null;
  cachedWallet = null;
  BotGlobal.logMessage('info', 'SDK缓存已清除');
}

/**
 * 获取当前SDK信息
 * @returns {Object} SDK信息
 */
function getSdkInfo() {
  if (!cachedSdk) {
    return {
      initialized: false,
      message: 'SDK未初始化'
    };
  }
  
  const config = BotGlobal.getConfig();
  return {
    initialized: true,
    network: config.network,
    walletIndex: config.walletIndex,
    walletAddress: cachedWallet?.keypair.publicKey.toString(),
    walletBalance: cachedWallet?.info.balance,
    programId: cachedSdk.programId.toString(),
    solanaEndpoint: cachedConnection?.rpcEndpoint
  };
}

/**
 * 检查钱包余额
 * @returns {Promise<Object>} 余额信息
 */
async function checkWalletBalance() {
  try {
    const { connection, wallet } = getSdk();
    
    const balance = await connection.getBalance(wallet.keypair.publicKey);
    const balanceSOL = (balance / 1e9).toFixed(4);
    
    BotGlobal.logMessage('info', `当前钱包SOL余额: ${balanceSOL} SOL`);
    
    return {
      lamports: balance,
      sol: parseFloat(balanceSOL),
      address: wallet.keypair.publicKey.toString()
    };
    
  } catch (error) {
    BotGlobal.logMessage('error', `检查钱包余额失败: ${error.message}`);
    throw error;
  }
}

/**
 * 验证SDK连接
 * @returns {Promise<boolean>} 是否连接正常
 */
async function validateConnection() {
  try {
    const { connection } = getSdk();
    
    BotGlobal.logMessage('info', '正在验证网络连接...');
    
    const blockHeight = await connection.getBlockHeight();
    const blockhash = await connection.getLatestBlockhash();
    
    BotGlobal.logMessage('info', `网络连接正常，当前区块高度: ${blockHeight}`);
    BotGlobal.logMessage('info', `最新区块哈希: ${blockhash.blockhash}`);
    
    return true;
    
  } catch (error) {
    BotGlobal.logMessage('error', `网络连接验证失败: ${error.message}`);
    return false;
  }
}

// 如果直接运行此文件，显示SDK信息
if (require.main === module) {
  console.log('=== SpinPet SDK 工厂信息 ===');
  
  try {
    const sdkObj = getSdk();
    const info = getSdkInfo();
    
    console.log('SDK状态:', info.initialized ? '已初始化' : '未初始化');
    console.log('网络:', info.network);
    console.log('钱包地址:', info.walletAddress);
    console.log('钱包余额:', info.walletBalance, 'SOL');
    console.log('程序ID:', info.programId);
    console.log('RPC端点:', info.solanaEndpoint);
    
    // 验证连接
    validateConnection().then(valid => {
      console.log('网络连接:', valid ? '正常' : '异常');
    });
    
    // 检查余额
    checkWalletBalance().then(balance => {
      console.log('实时余额:', balance.sol, 'SOL');
    });
    
  } catch (error) {
    console.error('SDK初始化失败:', error.message);
  }
}

module.exports = {
  getSdk,
  getConnection,
  getWallet,
  clearCache,
  getSdkInfo,
  checkWalletBalance,
  validateConnection
};