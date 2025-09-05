/**
 * 代币买入脚本
 * 使用 SpinPet SDK 买入代币并更新全局状态
 */

const BotGlobal = require('../bot-global');
const SdkFactory = require('../sdk-factory');
const anchor = require('@coral-xyz/anchor');

async function buyTokens(customParams = null) {
  const startTime = Date.now();
  
  try {
    // 更新执行状态
    BotGlobal.updateExecutionStep('buy', 'started');
    BotGlobal.logMessage('info', '=== 开始买入代币 ===');
    
    // 1. 获取配置和状态
    const config = BotGlobal.getConfig();
    const state = BotGlobal.getState();
    
    // 检查代币是否已创建
    if (!state.state.token.mintAddress) {
      throw new Error('代币尚未创建，请先运行 create-token.js');
    }
    
    const mintAddress = state.state.token.mintAddress;
    BotGlobal.logMessage('info', `使用代币地址: ${mintAddress}`);
    
    // 2. 获取买入参数
    let buyParams;
    if (customParams) {
      buyParams = customParams;
      BotGlobal.logMessage('info', '使用自定义买入参数');
    } else {
      // 从配置中查找买入计划
      const buyPlan = config.tradingPlan.find(plan => plan.type === 'buy' && plan.enabled);
      if (!buyPlan) {
        throw new Error('未找到启用的买入计划');
      }
      buyParams = buyPlan.params;
      BotGlobal.logMessage('info', `使用配置的买入参数: ${buyPlan.description}`);
    }
    
    const buyTokenAmount = new anchor.BN(buyParams.buyTokenAmount);
    const maxSolAmount = new anchor.BN(buyParams.maxSolAmount);
    
    const tokenAmountDisplay = (Number(buyParams.buyTokenAmount) / 1e6).toFixed(0);
    const maxSolDisplay = (Number(buyParams.maxSolAmount) / 1e9).toFixed(4);
    
    BotGlobal.logMessage('info', `买入数量: ${tokenAmountDisplay} 个代币`);
    BotGlobal.logMessage('info', `最大花费: ${maxSolDisplay} SOL`);
    
    // 3. 获取SDK实例
    const { sdk, connection, wallet } = SdkFactory.getSdk();
    
    // 检查钱包余额
    const walletBalance = await connection.getBalance(wallet.keypair.publicKey);
    const balanceSOL = (walletBalance / 1e9).toFixed(4);
    BotGlobal.logMessage('info', `钱包SOL余额: ${balanceSOL} SOL`);
    
    if (walletBalance < Number(buyParams.maxSolAmount)) {
      BotGlobal.logMessage('warn', `钱包余额 ${balanceSOL} SOL 可能不足以完成买入（需要 ${maxSolDisplay} SOL）`);
    }
    
    // 6. 模拟买入交易（可选）
    try {
      BotGlobal.logMessage('info', '正在模拟买入交易...');
      const simulation = await sdk.simulator.simulateTokenBuy(mintAddress, buyParams.buyTokenAmount);
      
      BotGlobal.logMessage('info', `模拟结果:`);
      BotGlobal.logMessage('info', `  - 完成度: ${simulation.completion}%`);
      BotGlobal.logMessage('info', `  - 价格滑点: ${simulation.slippage}%`);
      BotGlobal.logMessage('info', `  - 建议买入: ${(Number(simulation.suggestedTokenAmount) / 1e6).toFixed(2)} 个代币`);
      BotGlobal.logMessage('info', `  - 需要SOL: ${(Number(simulation.suggestedSolAmount) / 1e9).toFixed(6)} SOL`);
    } catch (simError) {
      BotGlobal.logMessage('warn', `模拟交易失败: ${simError.message}`);
    }
    
    // 4. 构建买入交易
    BotGlobal.logMessage('info', '开始构建买入交易...');
    const buyResult = await sdk.trading.buy({
      mintAccount: mintAddress,
      buyTokenAmount: buyTokenAmount,
      maxSolAmount: maxSolAmount,
      payer: wallet.keypair.publicKey
    });
    
    BotGlobal.logMessage('info', '买入交易已构建');
    BotGlobal.logMessage('info', '交易详情:');
    BotGlobal.logMessage('info', `  - 使用订单数: ${buyResult.orderData.ordersUsed}`);
    BotGlobal.logMessage('info', `  - LP配对数: ${buyResult.orderData.lpPairsCount}`);
    BotGlobal.logMessage('info', `  - 用户代币账户: ${buyResult.accounts.userTokenAccount.toString()}`);
    
    // 5. 签名并发送交易
    BotGlobal.logMessage('info', '开始签名和发送买入交易...');
    
    // 设置交易参数
    buyResult.transaction.feePayer = wallet.keypair.publicKey;
    buyResult.transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    
    // 签名交易（买入交易通常只需要payer签名）
    buyResult.transaction.sign(wallet.keypair, ...buyResult.signers);
    
    // 发送交易
    const signature = await connection.sendRawTransaction(
      buyResult.transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      }
    );
    
    BotGlobal.logMessage('info', `买入交易已发送，签名: ${signature}`);
    
    // 9. 等待交易确认
    BotGlobal.logMessage('info', '等待交易确认...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('买入交易失败: ' + JSON.stringify(confirmation.value.err));
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('info', `✅ 代币买入成功！耗时 ${duration} 秒`);
    BotGlobal.logMessage('info', `交易签名: ${signature}`);
    
    // 10. 查询买入后的代币余额
    let actualTokenBalance = '0';
    try {
      const tokenAccount = buyResult.accounts.userTokenAccount;
      const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount);
      actualTokenBalance = tokenAccountInfo.value.amount;
      
      const balanceDisplay = (Number(actualTokenBalance) / 1e6).toFixed(2);
      BotGlobal.logMessage('info', `买入后代币余额: ${balanceDisplay} 个代币`);
    } catch (balanceError) {
      BotGlobal.logMessage('warn', `获取代币余额失败: ${balanceError.message}`);
    }
    
    // 11. 查询买入后的SOL余额
    const newWalletBalance = await connection.getBalance(wallet.keypair.publicKey);
    const solSpent = walletBalance - newWalletBalance;
    const solSpentDisplay = (solSpent / 1e9).toFixed(6);
    const newBalanceDisplay = (newWalletBalance / 1e9).toFixed(4);
    
    BotGlobal.logMessage('info', `花费SOL: ${solSpentDisplay} SOL`);
    BotGlobal.logMessage('info', `剩余SOL余额: ${newBalanceDisplay} SOL`);
    
    // 12. 更新全局状态
    BotGlobal.setState('positions.spotBalance', actualTokenBalance);
    
    // 13. 添加交易历史
    BotGlobal.addTradeHistory({
      type: 'buy',
      description: `买入 ${tokenAmountDisplay} 个代币`,
      status: 'completed',
      txSignature: signature,
      mintAddress: mintAddress,
      params: {
        buyTokenAmount: buyParams.buyTokenAmount,
        maxSolAmount: buyParams.maxSolAmount
      },
      results: {
        actualTokenBalance: actualTokenBalance,
        solSpent: solSpent.toString(),
        userTokenAccount: buyResult.accounts.userTokenAccount.toString()
      },
      duration: duration + 's'
    });
    
    // 14. 更新执行状态
    BotGlobal.updateExecutionStep('buy', 'completed');
    
    // 15. 保存状态
    BotGlobal.saveState();
    
    BotGlobal.logMessage('info', '=== 代币买入完成 ===');
    
    return {
      success: true,
      signature: signature,
      mintAddress: mintAddress,
      actualTokenBalance: actualTokenBalance,
      solSpent: solSpent,
      accounts: buyResult.accounts,
      duration: duration
    };
    
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('error', `❌ 代币买入失败 (耗时 ${duration} 秒): ${error.message}`);
    BotGlobal.updateExecutionStep('buy', 'error', { error: error.message });
    
    // 添加失败的交易历史
    BotGlobal.addTradeHistory({
      type: 'buy',
      description: '代币买入失败',
      status: 'error',
      error: error.message,
      duration: duration + 's'
    });
    
    BotGlobal.saveState();
    
    throw error;
  }
}

// 如果直接运行此文件，执行买入
if (require.main === module) {
  buyTokens()
    .then((result) => {
      console.log('\n=== 买入执行结果 ===');
      console.log('成功:', result.success);
      console.log('交易签名:', result.signature);
      console.log('代币地址:', result.mintAddress);
      console.log('获得代币:', (Number(result.actualTokenBalance) / 1e6).toFixed(2), '个');
      console.log('花费SOL:', (Number(result.solSpent) / 1e9).toFixed(6), 'SOL');
      console.log('用时:', result.duration);
      
      // 显示状态报告
      console.log('\n');
      BotGlobal.printStatusReport();
    })
    .catch((error) => {
      console.error('\n=== 买入执行失败 ===');
      console.error('错误信息:', error.message);
      process.exit(1);
    });
}

module.exports = { buyTokens };