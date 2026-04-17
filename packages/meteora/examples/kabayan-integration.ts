/**
 * Example integration of EnhancedDLMMService with Kabayan-Bot
 *
 * This example demonstrates how to integrate the EnhancedDLMMService
 * into a Telegram bot or similar control plane application.
 */

import { EnhancedDLMMService, StrategyType } from '../src/core/enhanced-dlmm';
import * as fs from 'fs';
import * as path from 'path';

// Mock Telegram bot interface for demonstration
interface BotMessage {
  chatId: number;
  text: string;
  from: {
    id: number;
    username?: string;
  };
}

interface BotResponse {
  text: string;
  chatId: number;
}

/**
 * Example Kabayan-Bot integration service
 * Demonstrates how to use EnhancedDLMMService in a real bot context
 */
export class KabayanMeteoraIntegration {
  private meteoraService: EnhancedDLMMService;
  private configDir: string;

  constructor(rpcUrl: string, configDir: string = './data') {
    this.configDir = configDir;

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = path.join(configDir, 'meteora-config.json');
    const envPath = path.join(process.cwd(), '.env');

    // Initialize the enhanced DLMM service
    this.meteoraService = new EnhancedDLMMService(
      rpcUrl,
      configPath,
      envPath,
      {
        monitorInterval: 2500,     // Extreme mode check every 2.5 seconds
        minSolAmount: 0.001,       // Minimum SOL amount for operations
        feeBuffer: 0.08,           // SOL buffer for transaction fees
      }
    );

    console.log(`✅ EnhancedDLMMService initialized`);
    console.log(`📁 Config: ${configPath}`);
    console.log(`🔐 Env file: ${envPath}`);
  }

  /**
   * Handle /addwallet command from user
   */
  async handleAddWalletCommand(message: BotMessage): Promise<BotResponse> {
    const { text, chatId, from } = message;

    // Parse command: /addwallet <name> <privateKey>
    const parts = text.split(' ').slice(1);
    if (parts.length < 2) {
      return {
        text: 'Usage: /addwallet <name> <privateKey>\n\n⚠️ Make sure to use this command in private!',
        chatId,
      };
    }

    const [name, privateKey] = parts;

    try {
      const wallet = this.meteoraService.addWallet(name, privateKey);

      return {
        text: `✅ Wallet added successfully!\n\n` +
              `🔑 Name: ${wallet.name}\n` +
              `🆔 ID: ${wallet.id}\n` +
              `📬 Public key: ${wallet.pubkey.slice(0, 8)}...\n` +
              `💾 Stored securely in .env as: ${wallet.envKey}\n\n` +
              `⚠️ Never share your private key!`,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to add wallet: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /addpreset command
   */
  async handleAddPresetCommand(message: BotMessage): Promise<BotResponse> {
    const { text, chatId } = message;

    // Parse command: /addpreset <id> <name> <sol> <range> <strategy>
    const parts = text.split(' ').slice(1);
    if (parts.length < 5) {
      return {
        text: 'Usage: /addpreset <id> <name> <sol> <range> <strategy>\n\n' +
              'Examples:\n' +
              '• /addpreset spot1 "Spot Strategy" 1.5 20 spot\n' +
              '• /addpreset curve1 "Curve Strategy" "max" 15 curve\n' +
              '• /addpreset bidask1 "BidAsk" "50%" 0 bidask\n\n' +
              'Strategies: spot, curve, bidask\n' +
              'SOL can be: number, "max", or "50%" (percentage)',
        chatId,
      };
    }

    const [id, name, solStr, rangeStr, strategyStr] = parts;
    const range = parseFloat(rangeStr);

    // Parse SOL amount
    let sol: number | "max" | string;
    if (solStr === 'max') {
      sol = 'max';
    } else if (solStr.endsWith('%')) {
      sol = solStr;
    } else {
      sol = parseFloat(solStr);
    }

    // Parse strategy
    let strategy: StrategyType;
    switch (strategyStr.toLowerCase()) {
      case 'spot':
        strategy = StrategyType.Spot;
        break;
      case 'curve':
        strategy = StrategyType.Curve;
        break;
      case 'bidask':
        strategy = StrategyType.BidAsk;
        break;
      default:
        return {
          text: `❌ Invalid strategy: ${strategyStr}. Use: spot, curve, or bidask`,
          chatId,
        };
    }

    try {
      const preset = this.meteoraService.addPreset(id, name, sol, range, strategy);

      return {
        text: `✅ Preset added!\n\n` +
              `🆔 ID: ${preset.id}\n` +
              `📝 Name: ${preset.name}\n` +
              `💰 SOL: ${preset.sol}\n` +
              `🎯 Range: ${preset.range}%\n` +
              `📊 Strategy: ${StrategyType[preset.strategy]}\n\n` +
              `Use /switchpreset ${preset.id} to make this active`,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to add preset: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /addliq command (add liquidity)
   */
  async handleAddLiquidityCommand(message: BotMessage): Promise<BotResponse> {
    const { text, chatId } = message;

    // Parse command: /addliq <poolAddress>
    const parts = text.split(' ').slice(1);
    if (parts.length < 1) {
      return {
        text: 'Usage: /addliq <poolAddress>\n\n' +
              'Example: /addliq 7Zb1bR3...\n\n' +
              '⚠️ Uses the currently active preset',
        chatId,
      };
    }

    const poolAddress = parts[0];

    // Validate pool address
    if (!EnhancedDLMMService.isPoolInput(poolAddress)) {
      return {
        text: '❌ Invalid pool address format',
        chatId,
      };
    }

    try {
      // Get active preset
      const preset = this.meteoraService.getActivePreset();
      if (!preset) {
        return {
          text: '❌ No active preset configured. Use /addpreset first.',
          chatId,
        };
      }

      // Get active wallet balance for information
      const wallet = this.meteoraService.getActiveWallet();
      if (!wallet) {
        return {
          text: '❌ No active wallet. Use /addwallet first.',
          chatId,
        };
      }

      const balance = await this.meteoraService.getSolBalance(wallet.publicKey.toBase58());

      return {
        text: `🔄 Adding liquidity...\n\n` +
              `🏊 Pool: ${poolAddress.slice(0, 8)}...\n` +
              `📊 Preset: ${preset.name}\n` +
              `💰 Amount: ${preset.sol}\n` +
              `🎯 Range: ${preset.range}%\n` +
              `📈 Strategy: ${StrategyType[preset.strategy]}\n` +
              `💳 Wallet balance: ${balance.toFixed(4)} SOL\n\n` +
              `⏳ Processing transaction...`,
        chatId,
      };

      // Note: In real implementation, you would call:
      // const position = await this.meteoraService.addLiquidity(
      //   poolAddress,
      //   preset.sol,
      //   preset.range,
      //   preset.strategy
      // );

    } catch (error: any) {
      return {
        text: `❌ Failed to add liquidity: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /extreme command (start extreme mode)
   */
  async handleExtremeCommand(message: BotMessage): Promise<BotResponse> {
    const { text, chatId, from } = message;

    // Parse command: /extreme <poolAddress> <solAmount>
    const parts = text.split(' ').slice(1);
    if (parts.length < 2) {
      return {
        text: 'Usage: /extreme <poolAddress> <solAmount>\n\n' +
              'Examples:\n' +
              '• /extreme 7Zb1bR3... 1.5\n' +
              '• /extreme 7Zb1bR3... max\n' +
              '• /extreme 7Zb1bR3... 50%\n\n' +
              '⚠️ Extreme mode auto-rebalances every 2.5 seconds!',
        chatId,
      };
    }

    const [poolAddress, solAmountStr] = parts;

    // Validate pool address
    if (!EnhancedDLMMService.isPoolInput(poolAddress)) {
      return {
        text: '❌ Invalid pool address format',
        chatId,
      };
    }

    // Parse SOL amount
    let solAmount: number | "max" | string;
    if (solAmountStr === 'max') {
      solAmount = 'max';
    } else if (solAmountStr.endsWith('%')) {
      solAmount = solAmountStr;
    } else {
      const amount = parseFloat(solAmountStr);
      if (isNaN(amount) || amount <= 0) {
        return {
          text: '❌ Invalid SOL amount. Use number, "max", or percentage like "50%"',
          chatId,
        };
      }
      solAmount = amount;
    }

    try {
      // Start extreme session
      this.meteoraService.startExtremeSession(chatId, poolAddress, solAmount);

      // In real implementation, you would:
      // 1. Open extreme position
      // 2. Start monitoring timer
      // 3. Update session with position info

      return {
        text: `🚀 Extreme mode started!\n\n` +
              `🏊 Pool: ${poolAddress.slice(0, 8)}...\n` +
              `💰 Amount: ${solAmount}\n` +
              `🆔 Session ID: ${chatId}\n\n` +
              `⏱️ Auto-rebalance every 2.5 seconds\n` +
              `🎯 Strategy: Single-bin BidAsk\n\n` +
              `Use /stopextreme to stop\n` +
              `Use /status to check session`,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to start extreme mode: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /stopextreme command
   */
  async handleStopExtremeCommand(message: BotMessage): Promise<BotResponse> {
    const { chatId } = message;

    try {
      this.meteoraService.stopExtremeSession(chatId);

      return {
        text: `🛑 Extreme mode stopped for session ${chatId}\n\n` +
              `All active monitoring has been terminated.`,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to stop extreme mode: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /status command
   */
  async handleStatusCommand(message: BotMessage): Promise<BotResponse> {
    const { chatId } = message;

    try {
      // Get session info
      const session = this.meteoraService.getSession(chatId);

      // Get wallet info
      const wallet = this.meteoraService.getActiveWallet();
      let balance = 0;
      if (wallet) {
        balance = await this.meteoraService.getSolBalance(wallet.publicKey.toBase58());
      }

      // Get preset info
      const preset = this.meteoraService.getActivePreset();

      // Get all sessions
      const sessions = this.meteoraService.listSessions();

      let statusText = `📊 System Status\n\n`;

      statusText += `👛 Active Wallet:\n`;
      if (wallet) {
        statusText += `  • Balance: ${balance.toFixed(4)} SOL\n`;
        statusText += `  • Address: ${wallet.publicKey.toBase58().slice(0, 8)}...\n`;
      } else {
        statusText += `  • No active wallet\n`;
      }

      statusText += `\n📋 Active Preset:\n`;
      if (preset) {
        statusText += `  • ${preset.name} (${StrategyType[preset.strategy]})\n`;
        statusText += `  • SOL: ${preset.sol}, Range: ${preset.range}%\n`;
      } else {
        statusText += `  • No active preset\n`;
      }

      statusText += `\n🚀 Extreme Sessions: ${sessions.length}\n`;
      if (session) {
        statusText += `  • Session ${session.chatId}: ${session.status}\n`;
        statusText += `  • Pool: ${session.poolAddress.slice(0, 8)}...\n`;
        statusText += `  • Cycles: ${session.cycleCount || 0}\n`;
      }

      return {
        text: statusText,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to get status: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /sync command (sync positions with on-chain data)
   */
  async handleSyncCommand(message: BotMessage): Promise<BotResponse> {
    const { chatId } = message;

    try {
      const result = await this.meteoraService.syncPositions();

      return {
        text: `🔄 Positions Synced\n\n` +
              `📊 Total on-chain: ${result.total}\n` +
              `➕ Newly added: ${result.added}\n` +
              `➖ Removed: ${result.removed}\n\n` +
              `✅ Sync completed successfully`,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Sync failed: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /wallets command (list all wallets)
   */
  async handleWalletsCommand(message: BotMessage): Promise<BotResponse> {
    const { chatId } = message;

    try {
      const wallets = this.meteoraService.listWallets();

      if (wallets.length === 0) {
        return {
          text: `👛 No wallets configured\n\nUse /addwallet to add a wallet`,
          chatId,
        };
      }

      let walletsText = `👛 Configured Wallets (${wallets.length})\n\n`;

      wallets.forEach((wallet, index) => {
        walletsText += `${index + 1}. ${wallet.name}\n`;
        walletsText += `   🆔 ${wallet.id}\n`;
        walletsText += `   📬 ${wallet.pubkey.slice(0, 8)}...\n`;
        walletsText += `   💾 ${wallet.envKey}\n\n`;
      });

      walletsText += `\nUse /switchwallet <id> to switch active wallet`;

      return {
        text: walletsText,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to list wallets: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Handle /presets command (list all presets)
   */
  async handlePresetsCommand(message: BotMessage): Promise<BotResponse> {
    const { chatId } = message;

    try {
      const presets = this.meteoraService.listPresets();

      if (presets.length === 0) {
        return {
          text: `📋 No presets configured\n\nUse /addpreset to add a strategy preset`,
          chatId,
        };
      }

      let presetsText = `📋 Strategy Presets (${presets.length})\n\n`;

      presets.forEach((preset, index) => {
        const strategyName = StrategyType[preset.strategy];
        presetsText += `${index + 1}. ${preset.name}\n`;
        presetsText += `   🆔 ${preset.id}\n`;
        presetsText += `   💰 ${preset.sol} SOL\n`;
        presetsText += `   🎯 ${preset.range}% range\n`;
        presetsText += `   📊 ${strategyName}\n\n`;
      });

      presetsText += `\nUse /switchpreset <id> to switch active preset`;

      return {
        text: presetsText,
        chatId,
      };
    } catch (error: any) {
      return {
        text: `❌ Failed to list presets: ${error.message}`,
        chatId,
      };
    }
  }

  /**
   * Periodic extreme mode monitor (should be called every 2.5 seconds)
   */
  async monitorExtremeSessions(): Promise<void> {
    const sessions = this.meteoraService.listSessions();

    for (const session of sessions) {
      if (session.status === 'active') {
        await this.checkExtremeSession(session);
      }
    }
  }

  /**
   * Check and update a specific extreme session
   */
  private async checkExtremeSession(session: any): Promise<void> {
    // Implementation of extreme mode monitoring logic
    // This would check if position is out of range and trigger rebalance

    console.log(`[Extreme] Monitoring session ${session.chatId}, status: ${session.status}`);

    // Example logic:
    // 1. Check current bin vs target bin
    // 2. If out of range, execute withdrawAndReaddToTargetBin
    // 3. Update session status
    // 4. Send notifications if needed
  }

  /**
   * Get the underlying meteora service for advanced operations
   */
  getMeteoraService(): EnhancedDLMMService {
    return this.meteoraService;
  }
}

/**
 * Example usage in a Telegram bot
 */
export async function exampleTelegramBotIntegration() {
  // Initialize the integration service
  const integration = new KabayanMeteoraIntegration(
    process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
    './bot-data'
  );

  console.log('Kabayan-Meteora Integration Ready');
  console.log('================================');

  // Example: Simulate receiving a Telegram message
  const exampleMessage: BotMessage = {
    chatId: 123456789,
    text: '/addpreset spot1 "Spot Strategy" 1.5 20 spot',
    from: {
      id: 123456789,
      username: 'example_user',
    },
  };

  // Process the message
  const response = await integration.handleAddPresetCommand(exampleMessage);
  console.log('Bot would send:', response.text);

  // Example: Start extreme mode monitoring (call this every 2.5 seconds)
  setInterval(async () => {
    await integration.monitorExtremeSessions();
  }, 2500);

  return integration;
}

// Run example if this file is executed directly
if (require.main === module) {
  exampleTelegramBotIntegration().catch(console.error);
}
