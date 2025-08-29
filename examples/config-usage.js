const { Connection, PublicKey } = require('@solana/web3.js');
const SpinPetSdk = require('../src/sdk');

/**
 * SpinPet SDK 配置使用示例
 * 展示如何优雅地使用默认配置系统
 */

// 示例 1: 最简配置 - 使用所有默认值
async function basicUsage() {
  console.log('=== 基础使用示例 ===');
  
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = /* 你的钱包实例 */;
  const programId = 'YourProgramIdHere';
  
  // 只提供必要的账户配置，其他使用默认值
  const sdk = new SpinPetSdk(connection, wallet, programId, {
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey'
  });
  
  // 检查配置状态
  console.log('配置状态:', sdk.getConfigStatus());
  console.log('是否已配置:', sdk.isConfigured());
}

// 示例 2: 自定义配置 - 覆盖默认值
async function customConfiguration() {
  console.log('=== 自定义配置示例 ===');
  
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const wallet = /* 你的钱包实例 */;
  const programId = 'YourProgramIdHere';
  
  // 自定义配置，覆盖默认值
  const sdk = new SpinPetSdk(connection, wallet, programId, {
    // 必要配置
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey',
    
    // 自定义网络配置
    commitment: 'finalized',
    preflightCommitment: 'finalized',
    
    // 自定义超时和重试配置
    timeout: 120000, // 2分钟
    maxRetries: 5,
    retryDelay: 2000, // 2秒
    
    // 自定义 API URL
    spin_fast_api_url: 'https://custom-api.example.com',
    
    // 禁用严格验证
    strictValidation: false
  });
  
  console.log('当前配置:', sdk.getConfig());
  console.log('网络信息:', sdk.getNetworkInfo());
}

// 示例 3: 动态配置更新
async function dynamicConfiguration() {
  console.log('=== 动态配置更新示例 ===');
  
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = /* 你的钱包实例 */;
  const programId = 'YourProgramIdHere';
  
  // 初始配置
  const sdk = new SpinPetSdk(connection, wallet, programId, {
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey'
  });
  
  console.log('初始配置状态:', sdk.getConfigStatus());
  
  // 更新配置
  sdk.updateConfig({
    commitment: 'finalized',
    maxRetries: 10,
    spin_fast_api_url: 'https://new-api.example.com'
  });
  
  console.log('更新后配置:', sdk.getConfig());
  
  // 重置为默认配置
  sdk.resetToDefaults();
  console.log('重置后配置状态:', sdk.getConfigStatus());
}

// 示例 4: 环境特定配置
async function environmentSpecificConfiguration() {
  console.log('=== 环境特定配置示例 ===');
  
  const environment = process.env.NODE_ENV || 'development';
  
  // 根据环境选择不同的配置
  const envConfigs = {
    development: {
      commitment: 'confirmed',
      maxRetries: 3,
      timeout: 60000,
      spin_fast_api_url: 'https://dev-api.spinpet.com'
    },
    production: {
      commitment: 'finalized',
      maxRetries: 5,
      timeout: 120000,
      spin_fast_api_url: 'https://api.spinpet.com'
    },
    testing: {
      commitment: 'processed',
      maxRetries: 1,
      timeout: 30000,
      strictValidation: false
    }
  };
  
  const connection = new Connection(
    environment === 'production' 
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com'
  );
  
  const wallet = /* 你的钱包实例 */;
  const programId = 'YourProgramIdHere';
  
  const sdk = new SpinPetSdk(connection, wallet, programId, {
    fee_recipient: 'YourFeeRecipientPublicKey',
    base_fee_recipient: 'YourBaseFeeRecipientPublicKey',
    params_account: 'YourParamsAccountPublicKey',
    ...envConfigs[environment]
  });
  
  console.log(`${environment} 环境配置:`, sdk.getConfig());
}

// 示例 5: 配置验证和错误处理
async function configurationValidation() {
  console.log('=== 配置验证示例 ===');
  
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = /* 你的钱包实例 */;
  const programId = 'YourProgramIdHere';
  
  try {
    // 故意使用不完整的配置来演示验证
    const sdk = new SpinPetSdk(connection, wallet, programId, {
      // 缺少必要的账户配置
      spin_fast_api_url: 'invalid-url' // 无效的 URL
    });
    
    // 检查配置状态
    const status = sdk.getConfigStatus();
    if (!status.isConfigured) {
      console.log('SDK 未完全配置，缺少以下配置:');
      if (!status.accounts.feeRecipient) console.log('- fee_recipient');
      if (!status.accounts.baseFeeRecipient) console.log('- base_fee_recipient');
      if (!status.accounts.paramsAccount) console.log('- params_account');
    }
    
  } catch (error) {
    console.error('配置错误:', error.message);
  }
}

// 导出示例函数
module.exports = {
  basicUsage,
  customConfiguration,
  dynamicConfiguration,
  environmentSpecificConfiguration,
  configurationValidation
};

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
  console.log('SpinPet SDK 配置使用示例\n');
  
  // 注意: 这些示例需要真实的钱包和程序ID才能运行
  // 请根据你的实际情况修改配置值
  
  console.log('请查看代码中的示例函数，了解如何使用默认配置系统。');
  console.log('要运行示例，请提供真实的钱包实例和程序ID。');
}
