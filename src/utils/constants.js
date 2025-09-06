/**
 * SpinPet SDK default configuration constants
 */

// Default network configuration
const DEFAULT_NETWORKS = {
  MAINNET: {
    name: 'mainnet-beta',
    defaultDataSource: 'chain',
    solanaEndpoint: 'https://api.mainnet-beta.solana.com',
    spin_fast_api_url: 'https://api.spinpet.com',
    fee_recipient: '4nffmKaNrex34LkJ99RLxMt2BbgXeopUi8kJnom3YWbv',
    base_fee_recipient: '8fJpd2nteqkTEnXf4tG6d1MnP9p71KMCV4puc9vaq6kv',
    params_account: 'DVRnPDW1MvUhRhDfE1kU6aGHoQoufBCmQNbqUH4WFgUd'
  },
  TESTNET: {
    name: 'testnet',
    defaultDataSource: 'chain',
    solanaEndpoint: 'https://api.testnet.solana.com',
    spin_fast_api_url: 'https://api-testnet.spinpet.com',
    fee_recipient: '4nffmKaNrex34LkJ99RLxMt2BbgXeopUi8kJnom3YWbv',
    base_fee_recipient: '8fJpd2nteqkTEnXf4tG6d1MnP9p71KMCV4puc9vaq6kv',
    params_account: 'DVRnPDW1MvUhRhDfE1kU6aGHoQoufBCmQNbqUH4WFgUd'
  },
  LOCALNET: {
    name: 'localnet',
    defaultDataSource: 'chain', // 'fast' or 'chain'
    solanaEndpoint: 'http://192.168.18.5:8899',
    spin_fast_api_url: 'http://192.168.18.5:8080',
    fee_recipient: '2RJ7C7VsriVTUN1urdutdyYWNR6dUgA9MmMrC2u41xun',
    base_fee_recipient: '3ww7rUMSeSybAxYVid6zTj8GRV7Cg9Dij3L7wwcD3gfc',
    params_account: 'J2Mq3iGRAuAwvZSyHqAsFLdFDu5u7xTMotMvfkqAiscb'
  }
};



// Get default configuration
function getDefaultOptions(networkName = 'LOCALNET') {
  const networkConfig = DEFAULT_NETWORKS[networkName];
  
  return {
    ...networkConfig
  };
}

module.exports = {
  getDefaultOptions
};