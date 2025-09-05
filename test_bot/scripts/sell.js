/**
 * 代币卖出脚本
 * 使用 SpinPet SDK 卖出代币并更新全局状态
 */

const BotGlobal = require('../bot-global');
const SdkFactory = require('../sdk-factory');
const anchor = require('@coral-xyz/anchor');

async function sellTokens(customParams = null) {
  const startTime = Date.now();
  
  try {
    // 更新执行状态
    BotGlobal.updateExecutionStep('sell', 'started');
    BotGlobal.logMessage('info', '=== 开始卖出代币 ===');
    
    // 1. 获取配置和状态
    const config = BotGlobal.getConfig();
    const state = BotGlobal.getState();
    
    // 检查代币是否已创建
    if (!state.state.token.mintAddress) {
      throw new Error('代币尚未创建，请先运行 create-token.js');
    }
    
    const mintAddress = state.state.token.mintAddress;
    BotGlobal.logMessage('info', `使用代币地址: ${mintAddress}`);
    
    // 检查代币余额
    const currentBalance = state.state.positions.spotBalance;
    const balanceDisplay = (Number(currentBalance) / 1e6).toFixed(2);
    BotGlobal.logMessage('info', `当前代币余额: ${balanceDisplay} 个代币`);
    
    if (Number(currentBalance) <= 0) {
      throw new Error('代币余额不足，无法进行卖出操作');
    }
    
    // 2. 获取卖出参数
    let sellParams;
    if (customParams) {
      sellParams = customParams;
      BotGlobal.logMessage('info', '使用自定义卖出参数');
    } else {
      // 从配置中查找卖出计划
      const sellPlan = config.tradingPlan.find(plan => plan.type === 'sell' && plan.enabled);
      if (!sellPlan) {
        throw new Error('未找到启用的卖出计划');
      }
      sellParams = sellPlan.params;
      BotGlobal.logMessage('info', `使用配置的卖出参数: ${sellPlan.description}`);
    }
    
    const sellTokenAmount = new anchor.BN(sellParams.sellTokenAmount);
    const minSolOutput = new anchor.BN(sellParams.minSolOutput);
    
    const tokenAmountDisplay = (Number(sellParams.sellTokenAmount) / 1e6).toFixed(0);
    const minSolDisplay = (Number(sellParams.minSolOutput) / 1e9).toFixed(4);
    
    BotGlobal.logMessage('info', `卖出数量: ${tokenAmountDisplay} 个代币`);
    BotGlobal.logMessage('info', `最少获得: ${minSolDisplay} SOL`);
    
    // 检查余额是否足够卖出
    if (Number(currentBalance) < Number(sellParams.sellTokenAmount)) {
      const availableDisplay = (Number(currentBalance) / 1e6).toFixed(2);
      BotGlobal.logMessage('warn', `余额不足！可用 ${availableDisplay} 个代币，需要 ${tokenAmountDisplay} 个代币`);
      
      // 调整为最大可卖出数量
      const adjustedSellAmount = currentBalance;
      sellParams.sellTokenAmount = adjustedSellAmount;
      const adjustedDisplay = (Number(adjustedSellAmount) / 1e6).toFixed(2);
      
      BotGlobal.logMessage('info', `已调整卖出数量为: ${adjustedDisplay} 个代币`);
    }
    
    // 3. 获取SDK实例
    const { sdk, connection, wallet } = SdkFactory.getSdk();
    
    // 检查钱包SOL余额（用于支付gas费）
    const walletBalance = await connection.getBalance(wallet.keypair.publicKey);
    const balanceSOL = (walletBalance / 1e9).toFixed(4);
    BotGlobal.logMessage('info', `钱包SOL余额: ${balanceSOL} SOL`);
    
    // 6. 模拟卖出交易（可选）
    try {
      BotGlobal.logMessage('info', '正在模拟卖出交易...');
      const simulation = await sdk.simulator.simulateTokenSell(mintAddress, sellParams.sellTokenAmount);
      
      BotGlobal.logMessage('info', `模拟结果:`);
      BotGlobal.logMessage('info', `  - 完成度: ${simulation.completion}%`);
      BotGlobal.logMessage('info', `  - 价格滑点: ${simulation.slippage}%`);
      BotGlobal.logMessage('info', `  - 建议卖出: ${(Number(simulation.suggestedTokenAmount) / 1e6).toFixed(2)} 个代币`);
      BotGlobal.logMessage('info', `  - 预期获得: ${(Number(simulation.suggestedSolAmount) / 1e9).toFixed(6)} SOL`);
    } catch (simError) {
      BotGlobal.logMessage('warn', `模拟交易失败: ${simError.message}`);
    }
    
    // 4. 构建卖出交易
    BotGlobal.logMessage('info', '开始构建卖出交易...');
    const sellResult = await sdk.trading.sell({
      mintAccount: mintAddress,
      sellTokenAmount: new anchor.BN(sellParams.sellTokenAmount),
      minSolOutput: minSolOutput,
      payer: wallet.keypair.publicKey
    });
    
    BotGlobal.logMessage('info', '卖出交易已构建');
    BotGlobal.logMessage('info', '交易详情:');
    BotGlobal.logMessage('info', `  - 使用订单数: ${sellResult.orderData.ordersUsed}`);
    BotGlobal.logMessage('info', `  - LP配对数: ${sellResult.orderData.lpPairsCount}`);
    BotGlobal.logMessage('info', `  - 用户代币账户: ${sellResult.accounts.userTokenAccount.toString()}`);
    
    // 5. 签名并发送交易
    BotGlobal.logMessage('info', '开始签名和发送卖出交易...');
    
    // 设置交易参数
    sellResult.transaction.feePayer = wallet.keypair.publicKey;
    sellResult.transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    
    // 签名交易（卖出交易通常只需要payer签名）
    sellResult.transaction.sign(wallet.keypair, ...sellResult.signers);
    
    // 发送交易
    const signature = await connection.sendRawTransaction(
      sellResult.transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      }
    );
    
    BotGlobal.logMessage('info', `卖出交易已发送，签名: ${signature}`);
    
    // 9. 等待交易确认
    BotGlobal.logMessage('info', '等待交易确认...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('卖出交易失败: ' + JSON.stringify(confirmation.value.err));
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('info', `✅ 代币卖出成功！耗时 ${duration} 秒`);
    BotGlobal.logMessage('info', `交易签名: ${signature}`);
    
    // 10. 查询卖出后的代币余额
    let newTokenBalance = '0';
    try {
      const tokenAccount = sellResult.accounts.userTokenAccount;
      const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount);
      newTokenBalance = tokenAccountInfo.value.amount;
      
      const balanceDisplay = (Number(newTokenBalance) / 1e6).toFixed(2);
      BotGlobal.logMessage('info', `卖出后代币余额: ${balanceDisplay} 个代币`);
    } catch (balanceError) {
      BotGlobal.logMessage('warn', `获取代币余额失败: ${balanceError.message}`);
      
      // 计算余额（如果获取失败）
      const soldAmount = Number(sellParams.sellTokenAmount);
      newTokenBalance = (Number(currentBalance) - soldAmount).toString();
      const estimatedDisplay = (Number(newTokenBalance) / 1e6).toFixed(2);
      BotGlobal.logMessage('info', `估算剩余代币余额: ${estimatedDisplay} 个代币`);
    }
    
    // 11. 查询卖出后的SOL余额
    const newWalletBalance = await connection.getBalance(wallet.keypair.publicKey);
    const solReceived = newWalletBalance - walletBalance;
    const solReceivedDisplay = (solReceived / 1e9).toFixed(6);
    const newBalanceDisplay = (newWalletBalance / 1e9).toFixed(4);
    
    BotGlobal.logMessage('info', `获得SOL: ${solReceivedDisplay} SOL`);
    BotGlobal.logMessage('info', `总SOL余额: ${newBalanceDisplay} SOL`);
    
    // 12. 计算卖出统计
    const tokensSold = Number(currentBalance) - Number(newTokenBalance);
    const tokensSoldDisplay = (tokensSold / 1e6).toFixed(2);
    const avgPrice = tokensSold > 0 ? (solReceived / tokensSold * 1e3).toFixed(9) : '0';
    
    BotGlobal.logMessage('info', `实际卖出: ${tokensSoldDisplay} 个代币`);
    BotGlobal.logMessage('info', `平均价格: ${avgPrice} SOL/千代币`);
    
    // 13. 更新全局状态
    BotGlobal.setState('positions.spotBalance', newTokenBalance);
    
    // 14. 添加交易历史
    BotGlobal.addTradeHistory({
      type: 'sell',
      description: `卖出 ${tokensSoldDisplay} 个代币`,
      status: 'completed',
      txSignature: signature,
      mintAddress: mintAddress,
      params: {
        sellTokenAmount: sellParams.sellTokenAmount,
        minSolOutput: sellParams.minSolOutput
      },
      results: {
        tokensSold: tokensSold.toString(),
        solReceived: solReceived.toString(),
        newTokenBalance: newTokenBalance,
        avgPrice: avgPrice,
        userTokenAccount: sellResult.accounts.userTokenAccount.toString()
      },
      duration: duration + 's'
    });
    
    // 15. 更新执行状态
    BotGlobal.updateExecutionStep('sell', 'completed');
    
    // 16. 保存状态
    BotGlobal.saveState();
    
    BotGlobal.logMessage('info', '=== 代币卖出完成 ===');
    
    return {
      success: true,
      signature: signature,
      mintAddress: mintAddress,
      tokensSold: tokensSold,
      solReceived: solReceived,
      newTokenBalance: newTokenBalance,
      avgPrice: avgPrice,
      accounts: sellResult.accounts,
      duration: duration
    };
    
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('error', `❌ 代币卖出失败 (耗时 ${duration} 秒): ${error.message}`);
    BotGlobal.updateExecutionStep('sell', 'error', { error: error.message });
    
    // 添加失败的交易历史
    BotGlobal.addTradeHistory({
      type: 'sell',
      description: '代币卖出失败',
      status: 'error',
      error: error.message,
      duration: duration + 's'
    });
    
    BotGlobal.saveState();
    
    throw error;
  }
}

// 如果直接运行此文件，执行卖出
if (require.main === module) {
  sellTokens()
    .then((result) => {
      console.log('\n=== 卖出执行结果 ===');
      console.log('成功:', result.success);
      console.log('交易签名:', result.signature);
      console.log('代币地址:', result.mintAddress);
      console.log('卖出代币:', (Number(result.tokensSold) / 1e6).toFixed(2), '个');
      console.log('获得SOL:', (Number(result.solReceived) / 1e9).toFixed(6), 'SOL');
      console.log('剩余代币:', (Number(result.newTokenBalance) / 1e6).toFixed(2), '个');
      console.log('平均价格:', result.avgPrice, 'SOL/千代币');
      console.log('用时:', result.duration);
      
      // 显示状态报告
      console.log('\n');
      BotGlobal.printStatusReport();
    })
    .catch((error) => {
      console.error('\n=== 卖出执行失败 ===');
      console.error('错误信息:', error.message);
      process.exit(1);
    });
}

module.exports = { sellTokens };