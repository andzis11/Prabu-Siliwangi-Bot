# EnhancedDLMMService Integration Guide

## Overview

The `EnhancedDLMMService` is a comprehensive business logic layer for Meteora DLMM (Dynamic Liquidity Market Maker) operations. It provides wallet management, strategy presets, extreme mode with auto-rebalance, pool screening, and position monitoring—all extracted from the meteora-bin-hunter-master project.

## Installation

```bash
# Install the package
npm install @prabu/meteora

# Or if working within the monorepo
cd packages/meteora
npm install
```

## Basic Usage

```typescript
import { EnhancedDLMMService, StrategyType } from '@prabu/meteora';

// Initialize the service
const service = new EnhancedDLMMService(
  'https://api.mainnet-beta.solana.com',
  './meteora-config.json',  // Optional: custom config path
  './.env',                 // Optional: custom env file path
  {
    monitorInterval: 2500,   // Optional: extreme mode interval (default: 2500ms)
    minSolAmount: 0.001,     // Optional: minimum SOL amount
    feeBuffer: 0.08,         // Optional: buffer for transaction fees
  }
);
```

## Wallet Management

### Adding a Wallet

```typescript
// Add a new wallet with secure storage in .env
const wallet = service.addWallet(
  'My Wallet', 
  'your-private-key-in-base58-format'
);

console.log(`Wallet added: ${wallet.id} - ${wallet.name}`);
```

### Switching Active Wallet

```typescript
// Switch to a different wallet
service.switchWallet('wallet-id');

// Get the currently active wallet
const activeWallet = service.getActiveWallet();
```

### Listing and Managing Wallets

```typescript
// List all wallets
const wallets = service.listWallets();
wallets.forEach(w => console.log(`${w.id}: ${w.name} - ${w.pubkey}`));

// Delete a wallet
service.deleteWallet('wallet-id');
```

## Strategy Presets Management

### Creating Presets

```typescript
// Add strategy presets
service.addPreset('spot-1', 'Spot Strategy', 1.5, 20, StrategyType.Spot);
service.addPreset('curve-1', 'Curve Strategy', 2.0, 15, StrategyType.Curve);
service.addPreset('bidask-1', 'BidAsk Strategy', 'max', 0, StrategyType.BidAsk);

// Using percentage amounts
service.addPreset('percent-1', '50% Strategy', '50%', 25, StrategyType.Curve);
```

### Managing Presets

```typescript
// Get active preset
const activePreset = service.getActivePreset();

// Switch preset
service.switchPreset('bidask-1');

// List all presets
const presets = service.listPresets();

// Delete preset
service.deletePreset('preset-id');
```

## Pool Operations

### Getting Pool Information

```typescript
const poolInfo = await service.getPoolInfo('pool-address-here');
console.log(`Pool: ${poolInfo.tokenXSymbol}/${poolInfo.tokenYSymbol}`);
console.log(`Active bin: ${poolInfo.activeBin}, Bin step: ${poolInfo.binStep}`);
```

### Adding Liquidity

```typescript
// Add liquidity using a preset
const preset = service.getActivePreset();
const position = await service.addLiquidity(
  'pool-address-here',
  preset.sol,
  preset.range,
  preset.strategy
);

console.log(`Position created: ${position.publicKey}`);
console.log(`Tx hash: ${position.txHash}`);
```

### Removing Liquidity

```typescript
const txHashes = await service.removeLiquidity('position-public-key');
console.log(`Liquidity removed: ${txHashes.join(', ')}`);
```

## Extreme Mode with Auto-Rebalance

### Starting Extreme Mode Session

```typescript
// Start an extreme mode session (auto-rebalance every 2.5 seconds)
const session = service.startExtremeSession(
  12345,                    // Unique session ID (e.g., chatId)
  'pool-address-here',      // Pool address
  1.5                       // SOL amount (can be number, 'max', or '50%')
);

// Open extreme position (single bin BidAsk strategy)
const extremePos = await service.openExtremePosition(
  'pool-address-here',
  'max'                     // Use maximum available SOL
);

console.log(`Extreme position opened: ${extremePos.positionKey}`);
console.log(`Target bin: ${extremePos.targetBinId}`);
```

### Extreme Mode Operations

```typescript
// Withdraw and readd to target bin (for OOR - Out of Range situations)
const result = await service.withdrawAndReaddToTargetBin(
  'pool-address-here',
  'position-key',
  targetBinId
);

if (result === 'no_token') {
  console.log('No token balance after withdraw');
} else {
  console.log(`Token readded: ${result}`);
}

// Close extreme position
const closeResults = await service.closeExtremePositionOnly(
  'pool-address-here',
  'position-key'
);
```

### Session Management

```typescript
// Get session status
const session = service.getSession(12345);

// List all active sessions
const sessions = service.listSessions();

// Stop a session
service.stopExtremeSession(12345);
```

## Position Monitoring and Sync

### Getting Position Status

```typescript
const status = await service.getPositionStatus('position-public-key');

console.log(`Current bin: ${status.currentBin}`);
console.log(`Range: ${status.minBin} - ${status.maxBin}`);
console.log(`In range: ${status.inRange}`);

if (status.pnl) {
  console.log(`PnL: ${status.pnl.pnlSol} SOL (${status.pnl.pnlPctChange}%)`);
}
```

### Syncing Positions

```typescript
// Sync on-chain positions with local storage
const result = await service.syncPositions();

console.log(`Total positions: ${result.total}`);
console.log(`Added: ${result.added}, Removed: ${result.removed}`);
```

### Fetching PnL Data

```typescript
const pnl = await service.fetchPositionPnL('pool-address', 'owner-pubkey');

console.log(`PnL USD: $${pnl.pnlUsd.toFixed(2)}`);
console.log(`PnL SOL: ${pnl.pnlSol.toFixed(4)} SOL`);
console.log(`Unrealized PnL: ${pnl.unrealizedPnlSol.toFixed(4)} SOL`);
```

## Utility Methods

### Input Validation

```typescript
// Extract pool address from text
const address = EnhancedDLMMService.extractPoolAddress(
  'Some text with pool address 7Zb1... and more'
);

// Check if input is a pool address
const isValid = EnhancedDLMMService.isPoolInput('7Zb1bR...');
```

### Formatting

```typescript
// Shorten public key
const short = EnhancedDLMMService.shortKey('7Zb1bR...'); // "7Zb1...R..."

// Format SOL amount
const label = EnhancedDLMMService.solLabel(1.234567); // "1.2346 SOL"
```

## Configuration

### Configuration File Structure

The service automatically manages a configuration file (default: `meteora-config.json`):

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

### Environment Variables

Wallet private keys are securely stored in the `.env` file:

```env
WALLET_1=your-private-key-in-base58-format
WALLET_2=another-private-key-in-base58-format
HELIUS_API_KEY=your-helius-api-key-here
```

## Error Handling

The service throws descriptive errors for common issues:

```typescript
try {
  const wallet = service.getActiveWallet();
  if (!wallet) {
    throw new Error('No active wallet set');
  }
  
  const position = await service.addLiquidity(poolAddress, 1.5, 20, StrategyType.Spot);
} catch (error) {
  console.error(`Operation failed: ${error.message}`);
  
  if (error.message.includes('Insufficient SOL')) {
    // Handle insufficient funds
  } else if (error.message.includes('No active wallet')) {
    // Prompt user to add a wallet
  }
}
```

## Integration with Kabayan-Bot

### Basic Integration Example

```typescript
// In your bot's main file
import { EnhancedDLMMService, StrategyType } from '@prabu/meteora';

class KabayanBot {
  private meteoraService: EnhancedDLMMService;
  
  constructor() {
    this.meteoraService = new EnhancedDLMMService(
      process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
      './data/meteora-config.json',
      './.env'
    );
  }
  
  async handleAddWallet(message: string, userId: string) {
    // Extract wallet name and private key from message
    const [name, privateKey] = this.parseWalletInput(message);
    
    try {
      const wallet = this.meteoraService.addWallet(name, privateKey);
      return `Wallet ${wallet.name} added successfully!`;
    } catch (error) {
      return `Failed to add wallet: ${error.message}`;
    }
  }
  
  async handleAddLiquidity(poolAddress: string, userId: string) {
    try {
      const preset = this.meteoraService.getActivePreset();
      if (!preset) {
        return 'No strategy preset configured. Please add a preset first.';
      }
      
      const position = await this.meteoraService.addLiquidity(
        poolAddress,
        preset.sol,
        preset.range,
        preset.strategy
      );
      
      return `Liquidity added!\nPosition: ${position.publicKey}\nTx: ${position.txHash}`;
    } catch (error) {
      return `Failed to add liquidity: ${error.message}`;
    }
  }
  
  async handleExtremeMode(poolAddress: string, solAmount: string, userId: string) {
    const sessionId = parseInt(userId);
    
    try {
      // Start session
      this.meteoraService.startExtremeSession(sessionId, poolAddress, solAmount);
      
      // Open initial position
      const result = await this.meteoraService.openExtremePosition(poolAddress, solAmount);
      
      // Store session info
      const session = this.meteoraService.getSession(sessionId);
      session.positionKey = result.positionKey;
      session.targetBinId = result.targetBinId;
      session.status = 'active';
      
      return `Extreme mode started!\nPosition: ${result.positionKey}\nTarget bin: ${result.targetBinId}`;
    } catch (error) {
      return `Failed to start extreme mode: ${error.message}`;
    }
  }
}
```

### Scheduled Monitoring

```typescript
// Set up periodic monitoring
setInterval(async () => {
  const sessions = this.meteoraService.listSessions();
  
  for (const session of sessions) {
    if (session.status === 'active') {
      await this.monitorExtremePosition(session);
    }
  }
}, 2500); // Monitor every 2.5 seconds
```

## Best Practices

1. **Secure Storage**: Always store private keys in `.env` files, never in source code.
2. **Error Recovery**: Implement retry logic for RPC calls and transaction submissions.
3. **Session Management**: Clean up expired sessions to prevent memory leaks.
4. **Configuration Backup**: Regularly backup the configuration file.
5. **RPC Selection**: Use reliable RPC endpoints and implement fallback mechanisms.
6. **Fee Management**: Always maintain sufficient SOL for transaction fees (recommended: 0.08 SOL buffer).

## API Reference

### Core Methods

- `addWallet(name: string, privateKey: string): WalletConfig`
- `getActiveWallet(): Keypair | null`
- `switchWallet(walletId: string): void`
- `addPreset(id: string, name: string, sol: number | "max" | string, range: number, strategy: StrategyType): MeteoraPreset`
- `getActivePreset(): MeteoraPreset | null`
- `addLiquidity(poolAddress: string, solAmount: number | "max" | string, rangePercent: number, strategy: StrategyType): Promise<MeteoraPosition>`
- `removeLiquidity(positionKey: string): Promise<string[]>`
- `openExtremePosition(poolAddress: string, solAmount: number | "max" | string): Promise<{positionKey: string, targetBinId: number, txHash: string, solUsed: number}>`
- `startExtremeSession(sessionId: number, poolAddress: string, solAmount: number | "max" | string): ExtremeSession`
- `syncPositions(): Promise<SyncResult>`

### Static Utility Methods

- `extractPoolAddress(input: string): string | null`
- `isPoolInput(input: string): boolean`
- `shortKey(pubkey: string): string`
- `solLabel(amount: number): string`

## Support

For issues and questions:
1. Check the error messages - they are designed to be descriptive
2. Verify your RPC endpoint is working
3. Ensure you have sufficient SOL balance
4. Check that wallet private keys are in correct base58 format

## License

This module is part of the Prabu-Siliwangi project. See the main project for licensing information.