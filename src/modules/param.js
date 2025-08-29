const { PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

/**
 * Parameter Module
 * Handles creation and management of partner parameters
 */
class ParamModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Create partner parameters
   * @param {Object} params - Creation parameters
   * @param {PublicKey} params.partner - Partner public key
   * @returns {Promise<Object>} Object containing transaction, signers and account info
   */
  async createParams({ partner }) {
    console.log('Param Module - CreateParams:', { 
      partner: partner.toString()
    });

    // Calculate Admin account address (globally unique)
    const [adminAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      this.sdk.programId
    );

    // Calculate partner parameters account address (using partner address as seed)
    const [paramsAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("params"), partner.toBuffer()],
      this.sdk.programId
    );

    console.log('Calculated account addresses:');
    console.log('  Admin account:', adminAccount.toString());
    console.log('  Partner parameters account:', paramsAccount.toString());

    // Create transaction instructions
    const createParamsIx = await this.sdk.program.methods
      .createParams()
      .accounts({
        partner: partner,
        adminAccount: adminAccount,
        params: paramsAccount,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Create transaction and add instructions
    const transaction = new Transaction();
    transaction.add(createParamsIx);
    
    console.log('Partner parameters creation transaction built');
    
    return {
      transaction,
      signers: [], // createParams doesn't need additional signers, only partner signature
      accounts: {
        partner,
        adminAccount,
        paramsAccount
      }
    };
  }

  /**
   * Get partner parameters account data
   * @param {PublicKey} partner - Partner public key
   * @returns {Promise<Object>} Parameters account data
   */
  async getParams(partner) {
    // 计算合作伙伴参数账户地址
    const [paramsAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("params"), partner.toBuffer()],
      this.sdk.programId
    );

    try {
      // Check if account exists
      const accountInfo = await this.sdk.connection.getAccountInfo(paramsAccount);
      if (!accountInfo) {
        throw new Error('Partner parameters account does not exist');
      }
      
      // Try to parse data using Anchor
      if (this.sdk.program.account.params) {
        const paramsData = await this.sdk.program.account.params.fetch(paramsAccount);
        return {
          address: paramsAccount,
          data: paramsData
        };
      } else {
        // If Anchor is not available, return basic info
        return {
          address: paramsAccount,
          accountInfo: accountInfo
        };
      }
    } catch (error) {
      throw new Error(`Failed to get partner parameters: ${error.message}`);
    }
  }

  /**
   * Get Admin account data
   * @returns {Promise<Object>} Admin account data
   */
  async getAdmin() {
    // Calculate Admin account address
    const [adminAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      this.sdk.programId
    );

    try {
      // 检查账户是否存在
      const accountInfo = await this.sdk.connection.getAccountInfo(adminAccount);
      if (!accountInfo) {
        throw new Error('Admin account does not exist');
      }
      
      // 尝试使用 Anchor 解析数据
      if (this.sdk.program.account.admin) {
        const adminData = await this.sdk.program.account.admin.fetch(adminAccount);
        return {
          address: adminAccount,
          data: adminData
        };
      } else {
        // 如果 Anchor 不可用，返回基本信息
        return {
          address: adminAccount,
          accountInfo: accountInfo
        };
      }
    } catch (error) {
      throw new Error(`Failed to get Admin account: ${error.message}`);
    }
  }

  /**
   * Calculate partner parameters account address
   * @param {PublicKey} partner - Partner public key
   * @returns {PublicKey} Parameters account address
   */
  getParamsAddress(partner) {
    const [paramsAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("params"), partner.toBuffer()],
      this.sdk.programId
    );
    return paramsAccount;
  }

  /**
   * Calculate Admin account address
   * @returns {PublicKey} Admin account address
   */
  getAdminAddress() {
    const [adminAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      this.sdk.programId
    );
    return adminAccount;
  }
}

module.exports = ParamModule;
