/**
 * SpinPet SDK
 * SDK for Solana Anchor contracts
 * Modular design providing trading, token management and other features
 */

// Import main SDK class
const SpinPetSdk = require('./sdk');
const spinpetIdl = require('./idl/spinpet.json');
const { PublicKey } = require('@solana/web3.js');

// Import modules (optional, users can also access directly via sdk.trading)
const TradingModule = require('./modules/trading');
const TokenModule = require('./modules/token');



// Import configuration utilities
const { getDefaultOptions } = require('./utils/constants');

// Import utility classes
const OrderUtils = require('./utils/orderUtils');

// Import constants (if needed)
const SPINPET_PROGRAM_ID = new PublicKey(spinpetIdl.address); // Replace with actual program ID

// Main exports
module.exports = {
  // Main SDK class
  SpinPetSdk,
  
  // Constants
  SPINPET_PROGRAM_ID,
  
  // Configuration utilities
  getDefaultOptions,

  // Utility classes
  OrderUtils,
};

// Default export SDK class
module.exports.default = SpinPetSdk;
