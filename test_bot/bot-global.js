/**
 * SpinPet SDK 交易机器人全局状态管理器
 * 提供配置管理和状态持久化功能
 */

const fs = require('fs');
const path = require('path');

// ========== 用户配置区域 ==========
const CONFIG = {
  // 网络配置
  network: 'LOCALNET',
  walletIndex: 0,
  
  // 代币配置
  tokenInfo: {
    name: 'TestBot Token',
    symbol: 'TBT', 
    uri: 'https://example.com/testbot-token.json'
  },
  
  // 交易计划配置
  tradingPlan: [
    // 步骤1：创建代币
    { 
      type: 'create-token', 
      enabled: true, 
      description: '创建测试代币',
      params: {} 
    },
    // 步骤2：买入100,000个代币
    { 
      type: 'buy', 
      enabled: true, 
      description: '买入100,000个代币',
      params: {
        buyTokenAmount: '300000000000000',  // 100,000 tokens (精度 10^6)
        maxSolAmount: '50000000000'       // 最多花费5 SOL
      }
    },
    // 步骤3：卖出50,000个代币（50%）
    { 
      type: 'sell', 
      enabled: true, 
      description: '卖出50,000个代币',
      params: {
        sellTokenAmount: '5000000000',  // 50,000 tokens
        minSolOutput: '10'       // 最少得到1 SOL
      }
    },
    // 步骤4：做多交易（1 SOL，止损10%）
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 1 SOL，止损 20%',
      params: {
        useSol: 1000000000,    // 使用 1 SOL (lamports)
        downPercentage: 0.1    // 止损 20%
      }
    },
    // 步骤5：做多交易
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 2000000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.12    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.15    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.15    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.15    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.15    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.15    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.25    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.25    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.25    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.25    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.25    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.35    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.35    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.35    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.35    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.35    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.35    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.45    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.45    // 止损 30%
      }
    },
    { 
      type: 'long', 
      enabled: true,  // 启用做多交易测试
      description: '做多交易 2 SOL，止损 30%',
      params: {
        useSol: 200000000,    // 使用 2 SOL (lamports)
        downPercentage: 0.45    // 止损 30%
      }
    },


    // 步骤8：平仓做多交易
    { 
      type: 'closeLong', 
      enabled: true,  // 启用平仓做多测试
      description: '平仓做多交易（自动查找订单）',
      params: {}  // 无需参数，自动查找并平仓做多订单
    },
    // 步骤9：平仓做多交易
    { 
      type: 'closeLong', 
      enabled: true,  // 启用平仓做多测试
      description: '平仓做多交易（自动查找订单）',
      params: {}  // 无需参数，自动查找并平仓做多订单
    },
    // 步骤10：平仓做多交易
    { 
      type: 'closeLong', 
      enabled: true,  // 启用平仓做多测试
      description: '平仓做多交易（自动查找订单）',
      params: {}  // 无需参数，自动查找并平仓做多订单
    },
    // 步骤10：平仓做多交易
    { 
      type: 'closeLong', 
      enabled: true,  // 启用平仓做多测试
      description: '平仓做多交易（自动查找订单）',
      params: {}  // 无需参数，自动查找并平仓做多订单
    },

  ],
  
  // 日志配置
  logFile: 'logs/trading.log'
};

// ========== 自动填充的状态数据 ==========
let STATE = {
  // 代币信息
  token: {
    mintAddress: null,        // 创建后的mint地址
    mintKeypair: null,        // mint密钥对（Base58编码存储）
    curveAccount: null,       // 流动池账户地址
    poolTokenAccount: null,   // 流动池代币账户地址
    poolSolAccount: null,     // 流动池SOL账户地址
    createdAt: null,          // 创建时间
    createTxSignature: null   // 创建交易签名
  },
  
  // 交易历史记录（支持多次交易）
  tradingHistory: [],
  
  // 当前持仓状态
  positions: {
    spotBalance: '0',           // 现货余额
    longPositions: [],          // 多仓位列表
    shortPositions: []          // 空仓位列表
  },
  
  // 执行状态
  execution: {
    currentStep: 'idle',
    completedSteps: [],
    completedStepIndexes: [],  // 新增：已完成步骤索引列表
    errors: [],
    startTime: null,
    endTime: null
  }
};

// ========== 状态管理方法 ==========

/**
 * 获取完整状态
 */
function getState() {
  return {
    config: CONFIG,
    state: STATE
  };
}

/**
 * 获取配置
 */
function getConfig() {
  return CONFIG;
}

/**
 * 设置状态值
 * @param {string} path - 状态路径，如 'token.mintAddress'
 * @param {*} value - 状态值
 */
function setState(path, value) {
  const keys = path.split('.');
  let current = STATE;
  
  // 导航到最后一个键之前的对象
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  
  // 设置最后一个键的值
  current[keys[keys.length - 1]] = value;
}

/**
 * 添加交易历史记录
 * @param {Object} tradeRecord - 交易记录
 */
function addTradeHistory(tradeRecord) {
  const record = {
    ...tradeRecord,
    timestamp: new Date().toISOString(),
    index: STATE.tradingHistory.length
  };
  
  STATE.tradingHistory.push(record);
}

/**
 * 更新执行步骤
 * @param {string} step - 当前步骤
 * @param {string} status - 状态：'started', 'completed', 'error'
 * @param {Object} data - 额外数据
 */
function updateExecutionStep(step, status, data = {}) {
  if (status === 'started') {
    STATE.execution.currentStep = step;
    if (!STATE.execution.startTime) {
      STATE.execution.startTime = new Date().toISOString();
    }
  } else if (status === 'completed') {
    // 保持向后兼容，继续维护 completedSteps
    if (!STATE.execution.completedSteps.includes(step)) {
      STATE.execution.completedSteps.push(step);
    }
    // 新增：维护步骤索引列表
    if (data.stepIndex !== undefined) {
      if (!STATE.execution.completedStepIndexes) {
        STATE.execution.completedStepIndexes = [];
      }
      if (!STATE.execution.completedStepIndexes.includes(data.stepIndex)) {
        STATE.execution.completedStepIndexes.push(data.stepIndex);
      }
    }
    // 判断是否完成所有步骤（基于索引而非类型）
    const enabledStepsCount = CONFIG.tradingPlan.filter(p => p.enabled).length;
    const completedIndexesCount = STATE.execution.completedStepIndexes ? STATE.execution.completedStepIndexes.length : STATE.execution.completedSteps.length;
    if (completedIndexesCount === enabledStepsCount) {
      STATE.execution.endTime = new Date().toISOString();
      STATE.execution.currentStep = 'completed';
    }
  } else if (status === 'error') {
    STATE.execution.errors.push({
      step,
      error: data.error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * 记录日志消息
 * @param {string} level - 日志级别：'info', 'warn', 'error', 'debug'
 * @param {string} message - 日志消息
 */
function logMessage(level, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  // 输出到控制台
  console.log(logEntry);
  
  // 写入日志文件
  const logDir = path.dirname(CONFIG.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  fs.appendFileSync(CONFIG.logFile, logEntry + '\n');
}

/**
 * 保存状态到文件
 * @param {string} filePath - 可选的文件路径
 */
function saveState(filePath = 'test_bot/bot-state-backup.json') {
  try {
    const stateData = {
      config: CONFIG,
      state: STATE,
      savedAt: new Date().toISOString()
    };
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(stateData, null, 2));
    logMessage('info', `状态已保存到文件: ${filePath}`);
  } catch (error) {
    logMessage('error', `保存状态失败: ${error.message}`);
  }
}

/**
 * 从文件加载状态
 * @param {string} filePath - 可选的文件路径
 */
function loadState(filePath = 'test_bot/bot-state-backup.json') {
  try {
    if (!fs.existsSync(filePath)) {
      logMessage('warn', `状态文件不存在: ${filePath}`);
      return false;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 只恢复状态数据，不覆盖配置
    if (data.state) {
      STATE = { ...STATE, ...data.state };
      logMessage('info', `状态已从文件恢复: ${filePath}`);
      return true;
    }
  } catch (error) {
    logMessage('error', `加载状态失败: ${error.message}`);
  }
  return false;
}

/**
 * 重置状态
 */
function resetState() {
  STATE = {
    token: {
      mintAddress: null,
      mintKeypair: null,
      curveAccount: null,
      poolTokenAccount: null,
      poolSolAccount: null,
      createdAt: null,
      createTxSignature: null
    },
    tradingHistory: [],
    positions: {
      spotBalance: '0',
      longPositions: [],
      shortPositions: []
    },
    execution: {
      currentStep: 'idle',
      completedSteps: [],
      completedStepIndexes: [],
      errors: [],
      startTime: null,
      endTime: null
    }
  };
  
  logMessage('info', '状态已重置');
}

/**
 * 获取当前持仓摘要
 */
function getPositionSummary() {
  const summary = {
    totalTrades: STATE.tradingHistory.length,
    spotBalance: STATE.positions.spotBalance,
    longPositions: STATE.positions.longPositions.length,
    shortPositions: STATE.positions.shortPositions.length,
    completedSteps: STATE.execution.completedSteps.length,
    totalSteps: CONFIG.tradingPlan.filter(p => p.enabled).length,
    currentStep: STATE.execution.currentStep,
    hasErrors: STATE.execution.errors.length > 0
  };
  
  return summary;
}

/**
 * 显示详细状态报告
 */
function printStatusReport() {
  console.log('=== SpinPet 交易机器人状态报告 ===');
  
  // 基本信息
  console.log(`网络: ${CONFIG.network}`);
  console.log(`钱包索引: ${CONFIG.walletIndex}`);
  console.log(`代币: ${CONFIG.tokenInfo.name} (${CONFIG.tokenInfo.symbol})`);
  
  // 代币状态
  if (STATE.token.mintAddress) {
    console.log(`\n=== 代币信息 ===`);
    console.log(`Mint地址: ${STATE.token.mintAddress}`);
    console.log(`流动池账户: ${STATE.token.curveAccount}`);
    console.log(`创建时间: ${STATE.token.createdAt}`);
    console.log(`创建交易: ${STATE.token.createTxSignature}`);
  }
  
  // 执行状态
  const summary = getPositionSummary();
  console.log(`\n=== 执行状态 ===`);
  console.log(`当前步骤: ${summary.currentStep}`);
  console.log(`完成进度: ${summary.completedSteps}/${summary.totalSteps}`);
  console.log(`交易记录: ${summary.totalTrades} 笔`);
  
  // 持仓状态
  console.log(`\n=== 持仓状态 ===`);
  console.log(`现货余额: ${summary.spotBalance}`);
  console.log(`多仓位置: ${summary.longPositions} 个`);
  console.log(`空仓位置: ${summary.shortPositions} 个`);
  
  // 错误信息
  if (summary.hasErrors) {
    console.log(`\n=== 错误信息 ===`);
    STATE.execution.errors.forEach((error, index) => {
      console.log(`${index + 1}. [${error.step}] ${error.error} (${error.timestamp})`);
    });
  }
  
  // 交易历史
  if (STATE.tradingHistory.length > 0) {
    console.log(`\n=== 交易历史 ===`);
    STATE.tradingHistory.forEach((trade, index) => {
      console.log(`${index + 1}. [${trade.type}] ${trade.description} - ${trade.status} (${trade.timestamp})`);
      if (trade.txSignature) {
        console.log(`   交易签名: ${trade.txSignature}`);
      }
    });
  }
}

// ========== 模块导出 ==========
module.exports = {
  CONFIG,
  STATE,
  getState,
  getConfig,
  setState,
  addTradeHistory,
  updateExecutionStep,
  logMessage,
  saveState,
  loadState,
  resetState,
  getPositionSummary,
  printStatusReport
};

// 如果直接运行此文件，显示当前状态
if (require.main === module) {
  console.log('SpinPet 交易机器人全局状态管理器');
  console.log('当前配置和状态：');
  printStatusReport();
}