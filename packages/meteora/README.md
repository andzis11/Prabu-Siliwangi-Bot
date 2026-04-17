# @prabu/meteora

Enhanced Meteora DLMM module for Prabu-Siliwangi platform. Extracts and refactors business logic from meteora-bin-hunter-master to provide comprehensive DLMM (Dynamic Liquidity Market Maker) functionality.

## Features

### ✅ Wallet Management
- Secure wallet addition, deletion, and switching
- Private keys stored in `.env` files (never in source code)
- Multi-wallet support with active wallet tracking

### ✅ Strategy Presets Management
- Pre-configured strategy templates (Spot, Curve, BidAsk)
- Flexible SOL amount specification (fixed, percentage, or "max")
- Easy preset switching and management

### ✅ Extreme Mode with Auto-Rebalance
- Automatic rebalancing every 2.5 seconds
- Single bin BidAsk strategy for maximum efficiency
- Out-of-range detection and automatic adjustment
- Cycle counting and performance tracking

### ✅ Pool Screening & Position Monitoring
- Real-time pool information retrieval
- Position status monitoring with PnL data
- Automatic sync with on-chain positions
- Range checking and in/out of range status

### ✅ Comprehensive Business Logic
- All business logic extracted from meteora-bin-hunter-master
- Clean, type-safe TypeScript implementation
- No Telegram bot dependencies (pure business logic)
- Backward compatible with existing implementations

## Installation

```bash
# Within the monorepo
npm install

# As a standalone package
npm install @prabu/meteora
```

## Quick Start

```typescript
import { EnhancedDLMMService, StrategyType } from '@prabu/meteora';

// Initialize service
const meteora = new EnhancedDLMMService(
  'https://api.mainnet-beta.solana.com',
  './meteora-config.json',
  './.env'
);

// Add a wallet
const wallet = meteora.addWallet(
  'Main Wallet',
  'your-private-key-in-base58'
);

// Add strategy preset
meteora.addPreset('spot-1', 'Spot Strategy', 1.5, 20, StrategyType.Spot);

// Add liquidity
const position = await meteora.addLiquidity(
  'pool-address-here',
  'max',          // Use maximum available SOL
  20,             // 20% range
  StrategyType.Spot
);

// Start extreme mode
const session = meteora.startExtremeSession(
  12345,          // Session ID
  'pool-address',
  1.5             // SOL amount
);
```

## API Overview

### Core Classes

#### `EnhancedDLMMService`
The main service class providing all business logic functionality.

```typescript
const service = new EnhancedDLMMService(
  rpcUrl: string,
  configPath?: string,      // Default: './meteora-config.json'
  envPath?: string,         // Default: './.env'
  extremeConfig?: Partial<ExtremeModeConfig>
);
```

#### `DLMMService` (Legacy)
Original service maintained for backward compatibility.

### Key Methods

#### Wallet Management
- `addWallet(name: string, privateKey: string): WalletConfig`
- `getActiveWallet(): Keypair | null`
- `switchWallet(walletId: string): void`
- `deleteWallet(walletId: string): void`
- `listWallets(): WalletConfig[]`

#### Preset Management
- `addPreset(id: string, name: string, sol: number | "max" | string, range: number, strategy: StrategyType): MeteoraPreset`
- `getActivePreset(): MeteoraPreset | null`
- `switchPreset(presetId: string): void`
- `deletePreset(presetId: string): void`
- `listPresets(): MeteoraPreset[]`

#### Liquidity Operations
- `addLiquidity(poolAddress: string, solAmount: number | "max" | string, rangePercent: number, strategy: StrategyType): Promise<MeteoraPosition>`
- `removeLiquidity(positionKey: string): Promise<string[]>`
- `getPoolInfo(poolAddress: string): Promise<MeteoraPoolInfo>`

#### Extreme Mode
- `openExtremePosition(poolAddress: string, solAmount: number | "max" | string): Promise<ExtremePositionResult>`
- `withdrawAndReaddToTargetBin(poolAddress: string, positionKey: string, targetBinId: number): Promise<string | "no_token">`
- `closeExtremePositionOnly(poolAddress: string, positionKey: string): Promise<string[]>`
- `startExtremeSession(sessionId: number, poolAddress: string, solAmount: number | "max" | string): ExtremeSession`
- `stopExtremeSession(sessionId: number): void`

#### Monitoring & Sync
- `getPositionStatus(positionKey: string): Promise<PositionStatus | null>`
- `syncPositions(): Promise<SyncResult>`
- `fetchPositionPnL(poolAddress: string, owner: string): Promise<MeteoraPnL>`

### Static Utility Methods
- `EnhancedDLMMService.extractPoolAddress(input: string): string | null`
- `EnhancedDLMMService.isPoolInput(input: string): boolean`
- `EnhancedDLMMService.shortKey(pubkey: string): string`
- `EnhancedDLMMService.solLabel(amount: number): string`

## Configuration

### Configuration File (`meteora-config.json`)
The service automatically manages a JSON configuration file:

```json
{
  "wallets": {
    "abc123de": {
      "id": "abc123de",
      "name": "Main Wallet",
      "pubkey": "7Zb1bR...",
      "envKey": "WALLET_1"
    }
  },
  "activeWalletId": "abc123de",
  "positions": {
    "position-key": {
      "publicKey": "position-key",
      "poolAddress": "pool-address",
      "minBinId": 95,
      "maxBinId": 105,
      "solAmount": 1.5,
      "rangePercent": 10,
      "strategyStr": "Curve",
      "addedAt": "2024-01-15T10:30:00.000Z",
      "txHash": "transaction-hash",
      "cachedBinIds": [95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105],
      "walletId": "abc123de"
    }
  },
  "presets": {
    "spot-1": {
      "id": "spot-1",
      "name": "Spot Strategy",
      "sol": 1.5,
      "range": 20,
      "strategy": 0
    }
  },
  "activePresetId": "spot-1"
}
```

### Environment Variables (`.env`)
Private keys are stored securely:

```env
WALLET_1=your-private-key-in-base58-format
WALLET_2=another-private-key-in-base58-format
HELIUS_API_KEY=your-helius-api-key-here
```

## Types

### Core Types
```typescript
interface WalletConfig {
  id: string;
  name: string;
  pubkey: string;
  envKey: string;
}

interface MeteoraPreset {
  id: string;
  name: string;
  sol: number | "max" | string;  // 1.5, "max", "50%"
  range: number;
  strategy: StrategyType;
}

interface MeteoraPosition {
  publicKey: string;
  poolAddress: string;
  minBinId: number;
  maxBinId: number;
  activeBinAtAdd: number;
  solAmount: number;
  rangePercent: number;
  strategyStr: string;
  addedAt: string;
  txHash: string;
  cachedBinIds: number[];
  walletId: string;
  synced?: boolean;
}

interface ExtremeSession {
  chatId: number;
  poolAddress: string;
  positionKey: string;
  targetBinId: number;
  solAmount: number | "max" | string;
  status: "active" | "executing" | "oor" | "waiting" | "stopped";
  cycleCount: number;
  timer?: NodeJS.Timeout;
}
```

## Integration with Kabayan-Bot

### Example Integration

```typescript
// In kabayan-bot service
import { EnhancedDLMMService } from '@prabu/meteora';

class KabayanBotService {
  private meteora: EnhancedDLMMService;
  
  constructor() {
    this.meteora = new EnhancedDLMMService(
      process.env.RPC_URL,
      './data/meteora.json',
      './.env'
    );
  }
  
  async handleLiquidityCommand(poolAddress: string, userId: string) {
    const preset = this.meteora.getActivePreset();
    if (!preset) {
      return 'Please configure a strategy preset first.';
    }
    
    try {
      const position = await this.meteora.addLiquidity(
        poolAddress,
        preset.sol,
        preset.range,
        preset.strategy
      );
      
      return `✅ Liquidity added\n` +
             `Position: ${position.publicKey.slice(0, 8)}...\n` +
             `Amount: ${position.solAmount} SOL\n` +
             `Tx: ${position.txHash.slice(0, 16)}...`;
    } catch (error) {
      return `❌ Failed: ${error.message}`;
    }
  }
  
  async handleExtremeMode(poolAddress: string, solAmount: string, chatId: number) {
    try {
      this.meteora.startExtremeSession(chatId, poolAddress, solAmount);
      const result = await this.meteora.openExtremePosition(poolAddress, solAmount);
      
      return `🚀 Extreme mode started!\n` +
             `Position: ${result.positionKey.slice(0, 8)}...\n` +
             `Target bin: ${result.targetBinId}\n` +
             `SOL used: ${result.solUsed}`;
    } catch (error) {
      return `❌ Failed to start extreme mode: ${error.message}`;
    }
  }
}
```

### Scheduled Monitoring

```typescript
// Monitor extreme positions every 2.5 seconds
setInterval(async () => {
  const sessions = this.meteora.listSessions();
  
  for (const session of sessions) {
    if (session.status === 'active') {
      // Implement monitoring logic here
      await this.monitorExtremeSession(session);
    }
  }
}, 2500);
```

## Testing

Run the test suite:

```bash
cd packages/meteora
npm test
```

Or run specific tests:

```bash
npm test -- enhanced-dlmm.test.ts
```

## Development

### Project Structure
```
src/
├── core/
│   ├── dlmm.ts           # Original DLMMService (legacy)
│   └── enhanced-dlmm.ts  # Enhanced service with all business logic
├── types.ts              # TypeScript type definitions
└── index.ts              # Main exports
tests/
└── enhanced-dlmm.test.ts # Unit tests
docs/
└── integration.md        # Detailed integration guide
```

### Building
```bash
npm run build
```

## Business Logic Source

This package extracts and refactors business logic from:
- `Combine/meteora-bin-hunter-master/meteorabot.js`

**Extracted:**
- Wallet management with secure .env storage
- Strategy presets (Spot, Curve, BidAsk)
- Extreme mode with 2.5s auto-rebalance
- Pool screening and position monitoring
- Meteora platform API synchronization

**Excluded:**
- Telegram bot logic (`tgPoll`, `tgRequest`, `handleTgMessage`)
- User interface logic
- Telegram-specific state management

## Best Practices

1. **Security**: Never commit `.env` files or hardcode private keys
2. **Error Handling**: Always wrap transactions in try-catch blocks
3. **RPC Reliability**: Use multiple RPC endpoints with fallback
4. **Fee Management**: Maintain 0.08 SOL buffer for transaction fees
5. **Session Cleanup**: Stop extreme sessions when no longer needed
6. **Regular Sync**: Periodically sync positions with on-chain data

## Troubleshooting

### Common Issues

1. **"Private key not found"**: Ensure `.env` file exists and contains the wallet key
2. **"Insufficient SOL"**: Check balance and maintain fee buffer (0.08 SOL recommended)
3. **RPC timeouts**: Try a different RPC endpoint or implement retry logic
4. **Transaction failures**: Verify wallet has sufficient SOL for fees

### Debugging
Enable verbose logging by setting environment variable:
```bash
DEBUG_METEORA=1
```

## License

Part of the Prabu-Siliwangi project. See main project for licensing details.

## Support

For issues, feature requests, or contributions:
1. Check the existing documentation
2. Review the integration guide (`docs/integration.md`)
3. Examine the test suite for usage examples
4. Contact the development team

---

**Note**: This package is designed for integration with the Kabayan-Bot platform. It provides pure business logic without any UI components, making it ideal for use in backend services and automated trading systems.