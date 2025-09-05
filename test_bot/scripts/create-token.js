/**
 * 代币创建脚本
 * 使用 SpinPet SDK 创建新代币并更新全局状态
 */

const { Keypair, PublicKey } = require('@solana/web3.js');
const BotGlobal = require('../bot-global');
const SdkFactory = require('../sdk-factory');
const bs58 = require('bs58');

async function createToken() {
  const startTime = Date.now();
  
  try {
    // 更新执行状态
    BotGlobal.updateExecutionStep('create-token', 'started');
    BotGlobal.logMessage('info', '=== 开始创建代币 ===');
    
    // 1. 获取配置
    const config = BotGlobal.getConfig();
    const state = BotGlobal.getState();
    
    // 检查是否已经创建了代币
    if (state.state.token.mintAddress) {
      BotGlobal.logMessage('warn', `代币已存在，mint地址: ${state.state.token.mintAddress}`);
      return {
        success: true,
        mintAddress: state.state.token.mintAddress,
        skipped: true
      };
    }
    
    BotGlobal.logMessage('info', `代币信息: ${config.tokenInfo.name} (${config.tokenInfo.symbol})`);
    
    // 2. 获取SDK实例
    const { sdk, connection, wallet } = SdkFactory.getSdk();
    
    // 3. 生成新的代币 mint 密钥对
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey.toString();
    BotGlobal.logMessage('info', `生成代币 mint 地址: ${mintAddress}`);
    
    // 4. 创建代币
    BotGlobal.logMessage('info', '开始构建代币创建交易...');
    const createResult = await sdk.token.create({
      mint: mintKeypair,
      name: config.tokenInfo.name,
      symbol: config.tokenInfo.symbol,
      uri: config.tokenInfo.uri,
      payer: wallet.keypair.publicKey
    });
    
    BotGlobal.logMessage('info', '代币创建交易已构建');
    BotGlobal.logMessage('info', '相关账户:');
    BotGlobal.logMessage('info', `  - 支付者: ${createResult.accounts.payer.toString()}`);
    BotGlobal.logMessage('info', `  - 代币 Mint: ${createResult.accounts.mint.toString()}`);
    BotGlobal.logMessage('info', `  - 借贷流动池: ${createResult.accounts.curveAccount.toString()}`);
    BotGlobal.logMessage('info', `  - 流动池代币账户: ${createResult.accounts.poolTokenAccount.toString()}`);
    BotGlobal.logMessage('info', `  - 流动池SOL账户: ${createResult.accounts.poolSolAccount.toString()}`);
    
    // 5. 签名并发送交易
    BotGlobal.logMessage('info', '开始签名和发送交易...');
    
    // 设置交易参数
    createResult.transaction.feePayer = wallet.keypair.publicKey;
    createResult.transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    
    // 签名交易
    createResult.transaction.sign(wallet.keypair, ...createResult.signers);
    
    // 发送交易
    const signature = await connection.sendRawTransaction(
      createResult.transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      }
    );
    
    BotGlobal.logMessage('info', `交易已发送，签名: ${signature}`);
    
    // 9. 等待交易确认
    BotGlobal.logMessage('info', '等待交易确认...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('交易失败: ' + JSON.stringify(confirmation.value.err));
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('info', `✅ 代币创建成功！耗时 ${duration} 秒`);
    BotGlobal.logMessage('info', `交易签名: ${signature}`);
    BotGlobal.logMessage('info', `代币 Mint 地址: ${mintAddress}`);
    
    // 10. 更新全局状态
    const createdAt = new Date().toISOString();
    BotGlobal.setState('token.mintAddress', mintAddress);
    BotGlobal.setState('token.mintKeypair', bs58.encode(mintKeypair.secretKey));
    BotGlobal.setState('token.curveAccount', createResult.accounts.curveAccount.toString());
    BotGlobal.setState('token.poolTokenAccount', createResult.accounts.poolTokenAccount.toString());
    BotGlobal.setState('token.poolSolAccount', createResult.accounts.poolSolAccount.toString());
    BotGlobal.setState('token.createdAt', createdAt);
    BotGlobal.setState('token.createTxSignature', signature);
    
    // 11. 添加交易历史
    BotGlobal.addTradeHistory({
      type: 'create-token',
      description: `创建代币 ${config.tokenInfo.name} (${config.tokenInfo.symbol})`,
      status: 'completed',
      txSignature: signature,
      mintAddress: mintAddress,
      accounts: {
        mint: mintAddress,
        curveAccount: createResult.accounts.curveAccount.toString(),
        poolTokenAccount: createResult.accounts.poolTokenAccount.toString(),
        poolSolAccount: createResult.accounts.poolSolAccount.toString()
      },
      duration: duration + 's'
    });
    
    // 12. 更新执行状态
    BotGlobal.updateExecutionStep('create-token', 'completed');
    
    // 13. 保存状态
    BotGlobal.saveState();
    
    BotGlobal.logMessage('info', '=== 代币创建完成 ===');
    
    return {
      success: true,
      mintAddress: mintAddress,
      signature: signature,
      accounts: createResult.accounts,
      duration: duration
    };
    
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('error', `❌ 代币创建失败 (耗时 ${duration} 秒): ${error.message}`);
    BotGlobal.updateExecutionStep('create-token', 'error', { error: error.message });
    
    // 添加失败的交易历史
    BotGlobal.addTradeHistory({
      type: 'create-token',
      description: '代币创建失败',
      status: 'error',
      error: error.message,
      duration: duration + 's'
    });
    
    BotGlobal.saveState();
    
    throw error;
  }
}

// 验证代币创建结果
async function verifyTokenCreation(mintAddress, accounts) {
  try {
    BotGlobal.logMessage('info', '开始验证代币创建结果...');
    
    const { connection } = SdkFactory.getSdk();
    
    // 验证借贷流动池账户
    BotGlobal.logMessage('info', '正在验证借贷流动池账户...');
    const curveAccountInfo = await connection.getAccountInfo(new PublicKey(accounts.curveAccount));
    BotGlobal.logMessage('info', `借贷流动池账户状态: ${curveAccountInfo ? '存在' : '不存在'}`);
    
    if (curveAccountInfo) {
      BotGlobal.logMessage('info', `  账户大小: ${curveAccountInfo.data.length} 字节`);
      BotGlobal.logMessage('info', `  账户所有者: ${curveAccountInfo.owner.toString()}`);
      BotGlobal.logMessage('info', `  账户余额: ${curveAccountInfo.lamports} lamports`);
    }
    
    // 验证流动池SOL账户
    BotGlobal.logMessage('info', '正在验证流动池SOL账户...');
    const poolSolAccountInfo = await connection.getAccountInfo(new PublicKey(accounts.poolSolAccount));
    BotGlobal.logMessage('info', `流动池SOL账户状态: ${poolSolAccountInfo ? '存在' : '不存在'}`);
    
    if (poolSolAccountInfo) {
      BotGlobal.logMessage('info', `  账户余额: ${poolSolAccountInfo.lamports} lamports`);
      BotGlobal.logMessage('info', `  账户所有者: ${poolSolAccountInfo.owner.toString()}`);
    }
    
    BotGlobal.logMessage('info', '✅ 代币验证完成');
    
  } catch (error) {
    BotGlobal.logMessage('warn', `代币验证失败: ${error.message}`);
  }
}

// 如果直接运行此文件，执行代币创建
if (require.main === module) {
  createToken()
    .then(async (result) => {
      if (!result.skipped) {
        await verifyTokenCreation(result.mintAddress, result.accounts);
      }
      
      console.log('\n=== 执行结果 ===');
      console.log('成功:', result.success);
      console.log('代币地址:', result.mintAddress);
      if (result.signature) {
        console.log('交易签名:', result.signature);
      }
      if (result.skipped) {
        console.log('状态: 跳过（代币已存在）');
      }
      
      // 显示状态报告
      console.log('\n');
      BotGlobal.printStatusReport();
    })
    .catch((error) => {
      console.error('\n=== 执行失败 ===');
      console.error('错误信息:', error.message);
      process.exit(1);
    });
}

module.exports = { createToken, verifyTokenCreation };