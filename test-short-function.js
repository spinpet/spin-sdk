/**
 * Short 功能测试
 * 测试新开发的 short 功能，参数自动生成功能
 * 测试案例：1 SOL，止损 15%
 */

const executeShort = require('./test_bot/scripts/short');

/**
 * 主测试函数
 */
async function testShortFunction() {
  console.log('🚀 开始测试 Short 功能');
  console.log('测试案例：1 SOL，止损 15%\n');

  try {
    // 测试案例1：使用默认参数（1 SOL，15% 止损）
    console.log('=== 测试案例1：默认参数 ===');
    const result1 = await executeShort();
    
    if (result1.success) {
      console.log('✅ 默认参数测试成功');
      console.log(`  交易签名: ${result1.signature}`);
      console.log(`  订单地址: ${result1.orderAddress}`);
      console.log(`  借入数量: ${(Number(result1.borrowSellTokenAmount) / 1e6).toFixed(2)} 个代币`);
      console.log(`  保证金: ${(Number(result1.marginSol) / 1e9).toFixed(4)} SOL`);
      console.log(`  止损百分比: ${result1.stopLossPercentage.toFixed(2)}%`);
      console.log(`  杠杆倍数: ${result1.leverage.toFixed(2)}x`);
    } else {
      console.error('❌ 默认参数测试失败:', result1.error);
    }

    // 等待一下，避免过快连续交易
    console.log('\n等待 2 秒...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试案例2：自定义参数（0.5 SOL，20% 止损）
    console.log('\n=== 测试案例2：自定义参数 ===');
    const result2 = await executeShort({
      useSol: 500000000,  // 0.5 SOL
      upPercentage: 0.20  // 20% 止损
    });
    
    if (result2.success) {
      console.log('✅ 自定义参数测试成功');
      console.log(`  交易签名: ${result2.signature}`);
      console.log(`  订单地址: ${result2.orderAddress}`);
      console.log(`  借入数量: ${(Number(result2.borrowSellTokenAmount) / 1e6).toFixed(2)} 个代币`);
      console.log(`  保证金: ${(Number(result2.marginSol) / 1e9).toFixed(4)} SOL`);
      console.log(`  止损百分比: ${result2.stopLossPercentage.toFixed(2)}%`);
      console.log(`  杠杆倍数: ${result2.leverage.toFixed(2)}x`);
    } else {
      console.error('❌ 自定义参数测试失败:', result2.error);
    }

    // 等待一下，避免过快连续交易
    console.log('\n等待 2 秒...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试案例3：边界情况测试（2 SOL，5% 止损）
    console.log('\n=== 测试案例3：边界情况 ===');
    const result3 = await executeShort({
      useSol: 2000000000, // 2 SOL
      upPercentage: 0.05  // 5% 止损
    });
    
    if (result3.success) {
      console.log('✅ 边界情况测试成功');
      console.log(`  交易签名: ${result3.signature}`);
      console.log(`  订单地址: ${result3.orderAddress}`);
      console.log(`  借入数量: ${(Number(result3.borrowSellTokenAmount) / 1e6).toFixed(2)} 个代币`);
      console.log(`  保证金: ${(Number(result3.marginSol) / 1e9).toFixed(4)} SOL`);
      console.log(`  止损百分比: ${result3.stopLossPercentage.toFixed(2)}%`);
      console.log(`  杠杆倍数: ${result3.leverage.toFixed(2)}x`);
    } else {
      console.error('❌ 边界情况测试失败:', result3.error);
    }

    // 输出测试总结
    console.log('\n=== 测试总结 ===');
    const successCount = [result1, result2, result3].filter(r => r.success).length;
    const totalCount = 3;
    
    console.log(`成功: ${successCount}/${totalCount}`);
    console.log(`失败: ${totalCount - successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
      console.log('🎉 所有测试通过！');
      return true;
    } else {
      console.log('⚠️ 部分测试失败');
      return false;
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error('错误堆栈:', error.stack);
    return false;
  }
}

/**
 * 单独测试指定参数的功能
 */
async function testSpecificCase(useSol, upPercentage) {
  console.log(`\n🎯 测试指定参数: ${(useSol / 1e9).toFixed(2)} SOL, ${(upPercentage * 100).toFixed(1)}% 止损`);
  
  const result = await executeShort({
    useSol: useSol,
    upPercentage: upPercentage
  });
  
  if (result.success) {
    console.log('✅ 测试成功');
    console.log('详细结果:');
    console.log(`  交易签名: ${result.signature}`);
    console.log(`  订单地址: ${result.orderAddress}`);
    console.log(`  借入数量: ${(Number(result.borrowSellTokenAmount) / 1e6).toFixed(2)} 个代币`);
    console.log(`  保证金: ${(Number(result.marginSol) / 1e9).toFixed(4)} SOL`);
    console.log(`  平仓价格: ${result.closePrice}`);
    console.log(`  止损百分比: ${result.stopLossPercentage.toFixed(2)}%`);
    console.log(`  杠杆倍数: ${result.leverage.toFixed(2)}x`);
  } else {
    console.error('❌ 测试失败:', result.error);
  }
  
  return result;
}

// 如果直接运行此文件
if (require.main === module) {
  console.log('Short 功能测试启动');
  console.log('支持的测试模式:');
  console.log('  node test-short-function.js           # 运行完整测试套件');
  console.log('  node test-short-function.js --case    # 测试指定案例 (1 SOL, 15%)');
  console.log('');

  const args = process.argv.slice(2);
  
  if (args.includes('--case')) {
    // 测试指定案例：1 SOL，15% 止损
    testSpecificCase(1000000000, 0.15).then(result => {
      if (result.success) {
        console.log('\n✅ 指定案例测试完成');
        process.exit(0);
      } else {
        console.error('\n❌ 指定案例测试失败');
        process.exit(1);
      }
    }).catch(error => {
      console.error('测试异常:', error);
      process.exit(1);
    });
  } else {
    // 运行完整测试套件
    testShortFunction().then(success => {
      if (success) {
        console.log('\n✅ 完整测试套件通过');
        process.exit(0);
      } else {
        console.error('\n❌ 测试套件失败');
        process.exit(1);
      }
    }).catch(error => {
      console.error('测试异常:', error);
      process.exit(1);
    });
  }
}

module.exports = {
  testShortFunction,
  testSpecificCase
};