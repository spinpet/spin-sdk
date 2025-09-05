/**
 * 交易计划执行脚本
 * 按照 bot-global.js 中的 tradingPlan 配置执行完整的交易流程
 */

const BotGlobal = require('../bot-global');

// 导入所有交易模块
const { createToken } = require('./create-token');
const { buyTokens } = require('./buy');
const { sellTokens } = require('./sell');
// TODO: 未来添加保证金交易模块
// const { longPosition } = require('./long');
// const { shortPosition } = require('./short');
// const { closeLongPosition } = require('./close-long');
// const { closeShortPosition } = require('./close-short');

// 交易类型映射
const TRADE_HANDLERS = {
  'create-token': createToken,
  'buy': buyTokens,
  'sell': sellTokens,
  // TODO: 添加保证金交易处理器
  'long': null,      // 待实现
  'short': null,     // 待实现
  'closeLong': null, // 待实现
  'closeShort': null // 待实现
};

/**
 * 执行单个交易步骤
 * @param {Object} planStep - 交易计划步骤
 * @param {number} stepIndex - 步骤索引
 */
async function executeStep(planStep, stepIndex) {
  const { type, enabled, description, params } = planStep;
  
  if (!enabled) {
    BotGlobal.logMessage('info', `步骤 ${stepIndex + 1}: [${type}] ${description} - 跳过（未启用）`);
    return {
      success: true,
      skipped: true,
      type: type,
      description: description
    };
  }
  
  BotGlobal.logMessage('info', `步骤 ${stepIndex + 1}: [${type}] ${description} - 开始执行`);
  
  // 检查处理器是否存在
  const handler = TRADE_HANDLERS[type];
  if (!handler) {
    throw new Error(`未支持的交易类型: ${type}。可用类型: ${Object.keys(TRADE_HANDLERS).join(', ')}`);
  }
  
  try {
    // 执行交易步骤
    const result = await handler(params);
    
    BotGlobal.logMessage('info', `步骤 ${stepIndex + 1}: [${type}] ${description} - 执行成功`);
    
    return {
      success: true,
      type: type,
      description: description,
      result: result
    };
    
  } catch (error) {
    BotGlobal.logMessage('error', `步骤 ${stepIndex + 1}: [${type}] ${description} - 执行失败: ${error.message}`);
    
    return {
      success: false,
      type: type,
      description: description,
      error: error.message
    };
  }
}

/**
 * 执行完整的交易计划
 * @param {Object} options - 执行选项
 */
async function runTradingPlan(options = {}) {
  const startTime = Date.now();
  const {
    continueOnError = false,     // 出错时是否继续执行
    skipCompleted = true,        // 是否跳过已完成的步骤
    resetState = false          // 是否重置状态
  } = options;
  
  try {
    BotGlobal.logMessage('info', '=== SpinPet 交易机器人开始执行 ===');
    
    // 可选：重置状态
    if (resetState) {
      BotGlobal.logMessage('info', '重置全局状态...');
      BotGlobal.resetState();
    }
    
    // 获取配置
    const config = BotGlobal.getConfig();
    const state = BotGlobal.getState();
    
    BotGlobal.logMessage('info', `网络: ${config.network}`);
    BotGlobal.logMessage('info', `钱包索引: ${config.walletIndex}`);
    BotGlobal.logMessage('info', `代币: ${config.tokenInfo.name} (${config.tokenInfo.symbol})`);
    
    // 获取交易计划
    const tradingPlan = config.tradingPlan;
    const enabledSteps = tradingPlan.filter(step => step.enabled);
    
    BotGlobal.logMessage('info', `交易计划总步骤: ${tradingPlan.length}`);
    BotGlobal.logMessage('info', `启用的步骤: ${enabledSteps.length}`);
    
    if (enabledSteps.length === 0) {
      BotGlobal.logMessage('warn', '没有启用的交易步骤，退出执行');
      return {
        success: true,
        message: '没有启用的交易步骤',
        results: []
      };
    }
    
    // 显示执行计划
    BotGlobal.logMessage('info', '\n执行计划:');
    tradingPlan.forEach((step, index) => {
      const status = step.enabled ? '启用' : '禁用';
      BotGlobal.logMessage('info', `  ${index + 1}. [${step.type}] ${step.description} - ${status}`);
    });
    BotGlobal.logMessage('info', '');
    
    // 执行结果
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // 获取已完成的步骤
    const completedSteps = state.state.execution.completedSteps;
    
    // 逐步执行交易计划
    for (let i = 0; i < tradingPlan.length; i++) {
      const step = tradingPlan[i];
      
      // 如果设置跳过已完成步骤，且步骤已完成，则跳过
      if (skipCompleted && completedSteps.includes(step.type)) {
        BotGlobal.logMessage('info', `步骤 ${i + 1}: [${step.type}] ${step.description} - 跳过（已完成）`);
        results.push({
          success: true,
          skipped: true,
          alreadyCompleted: true,
          type: step.type,
          description: step.description
        });
        skippedCount++;
        continue;
      }
      
      try {
        const result = await executeStep(step, i);
        results.push(result);
        
        if (result.skipped) {
          skippedCount++;
        } else if (result.success) {
          successCount++;
        } else {
          errorCount++;
          
          // 如果不继续执行，则停止
          if (!continueOnError) {
            BotGlobal.logMessage('error', '遇到错误，停止执行剩余步骤');
            break;
          }
        }
        
      } catch (error) {
        errorCount++;
        results.push({
          success: false,
          type: step.type,
          description: step.description,
          error: error.message
        });
        
        BotGlobal.logMessage('error', `执行步骤失败: ${error.message}`);
        
        if (!continueOnError) {
          BotGlobal.logMessage('error', '遇到错误，停止执行剩余步骤');
          break;
        }
      }
      
      // 在步骤之间添加短暂延迟
      if (i < tradingPlan.length - 1) {
        BotGlobal.logMessage('info', '等待 2 秒后执行下一步骤...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const endTime = Date.now();
    const totalDuration = ((endTime - startTime) / 1000).toFixed(2);
    
    // 生成执行报告
    BotGlobal.logMessage('info', '\n=== 执行完成 ===');
    BotGlobal.logMessage('info', `总用时: ${totalDuration} 秒`);
    BotGlobal.logMessage('info', `成功步骤: ${successCount}`);
    BotGlobal.logMessage('info', `失败步骤: ${errorCount}`);
    BotGlobal.logMessage('info', `跳过步骤: ${skippedCount}`);
    
    // 详细结果
    BotGlobal.logMessage('info', '\n=== 详细结果 ===');
    results.forEach((result, index) => {
      const step = tradingPlan[index];
      let statusMsg = '';
      
      if (result.alreadyCompleted) {
        statusMsg = '已完成（跳过）';
      } else if (result.skipped) {
        statusMsg = '跳过';
      } else if (result.success) {
        statusMsg = '成功';
      } else {
        statusMsg = `失败: ${result.error}`;
      }
      
      BotGlobal.logMessage('info', `  ${index + 1}. [${result.type}] ${result.description} - ${statusMsg}`);
    });
    
    // 最终状态报告
    BotGlobal.logMessage('info', '\n=== 最终状态 ===');
    BotGlobal.printStatusReport();
    
    // 保存状态
    BotGlobal.saveState();
    
    const overallSuccess = errorCount === 0;
    if (overallSuccess) {
      BotGlobal.logMessage('info', '🎉 交易计划执行完成！');
    } else {
      BotGlobal.logMessage('warn', '⚠️ 交易计划执行完成，但有错误发生');
    }
    
    return {
      success: overallSuccess,
      totalDuration: totalDuration,
      successCount,
      errorCount,
      skippedCount,
      results
    };
    
  } catch (error) {
    const endTime = Date.now();
    const totalDuration = ((endTime - startTime) / 1000).toFixed(2);
    
    BotGlobal.logMessage('error', `❌ 交易计划执行失败 (耗时 ${totalDuration} 秒): ${error.message}`);
    BotGlobal.saveState();
    
    throw error;
  }
}

/**
 * 显示当前交易计划
 */
function showTradingPlan() {
  const config = BotGlobal.getConfig();
  const state = BotGlobal.getState();
  
  console.log('=== 当前交易计划 ===');
  console.log(`网络: ${config.network}`);
  console.log(`钱包索引: ${config.walletIndex}`);
  console.log(`代币: ${config.tokenInfo.name} (${config.tokenInfo.symbol})`);
  console.log('');
  
  console.log('交易步骤:');
  config.tradingPlan.forEach((step, index) => {
    const status = step.enabled ? '✅ 启用' : '❌ 禁用';
    const completed = state.state.execution.completedSteps.includes(step.type) ? '(已完成)' : '';
    
    console.log(`  ${index + 1}. [${step.type}] ${step.description} - ${status} ${completed}`);
    
    // 显示参数
    if (step.params && Object.keys(step.params).length > 0) {
      Object.entries(step.params).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
    }
  });
  
  console.log('');
  console.log('执行命令:');
  console.log('  node test_bot/scripts/run-plan.js                  # 执行完整计划');
  console.log('  node test_bot/scripts/run-plan.js --show           # 显示当前计划');
  console.log('  node test_bot/scripts/run-plan.js --reset          # 重置状态后执行');
  console.log('  node test_bot/scripts/run-plan.js --continue-error # 出错时继续执行');
}

// 如果直接运行此文件
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // 解析命令行参数
  const showOnly = args.includes('--show');
  const resetState = args.includes('--reset');
  const continueOnError = args.includes('--continue-error');
  
  if (showOnly) {
    showTradingPlan();
  } else {
    runTradingPlan({
      resetState,
      continueOnError
    })
      .then((result) => {
        console.log('\n=== 最终执行结果 ===');
        console.log('成功:', result.success);
        console.log('总用时:', result.totalDuration, '秒');
        console.log('成功步骤:', result.successCount);
        console.log('失败步骤:', result.errorCount);
        console.log('跳过步骤:', result.skippedCount);
        
        process.exit(result.success ? 0 : 1);
      })
      .catch((error) => {
        console.error('\n=== 执行失败 ===');
        console.error('错误信息:', error.message);
        process.exit(1);
      });
  }
}

module.exports = { 
  runTradingPlan, 
  showTradingPlan,
  executeStep,
  TRADE_HANDLERS
};