# @prabu/pnl-renderer

Complete PnL card rendering package for Prabu-Siliwangi trading ecosystem. Generates professional trading performance cards with multiple themes, currency support, and canvas-based rendering.

## Features

- 🎨 **Multiple Themes**: Dark, Orange, Green, Purple themes with custom glow effects
- 💱 **Currency Support**: USD and IDR with automatic formatting and conversion
- 🖼️ **Canvas-based Rendering**: High-quality image generation using @napi-rs/canvas
- 🔧 **Customizable**: Hide sections, customize colors, add user avatars
- 📊 **Professional Design**: Clean, readable cards with all essential trading metrics
- 🔄 **Backward Compatible**: Compatible with existing Prabu-Siliwangi interfaces

## Installation

```bash
# Install from workspace
npm install @prabu/pnl-renderer

# Or install dependencies separately
npm install @napi-rs/canvas
```

## Quick Start

```typescript
import { createCanvasPnLRenderer, type PnLCardData } from '@prabu/pnl-renderer';

// Create renderer instance
const renderer = createCanvasPnLRenderer();

// Prepare PnL data
const pnlData: PnLCardData = {
  pairName: 'SOL/USDC',
  pnlUsd: 1234.56,
  pnlPct: 12.34,
  depositedUsd: 10000,
  binStep: 10,
  baseFeePct: 0.01,
  openedAt: Date.now() / 1000 - 86400,
  currentValueUsd: 11234.56,
  feesEarnedUsd: 45.67,
  positionAgeSeconds: 86400,
  walletAddress: '7X8Z9A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0',
  poolAddress: 'DvLrUWmQ8wKgeNk1JcY8QApH7NKGjT8J7p5P8eG9tK1L'
};

// Generate card
const cardBuffer = await renderer.generateCard(pnlData, {
  theme: 'dark',
  currency: 'USD',
  user: {
    displayName: 'CryptoTrader42',
    avatarUrl: 'https://example.com/avatar.png'
  }
});

// Save to file
import * as fs from 'fs';
fs.writeFileSync('pnl-card.png', cardBuffer);
```

## API Reference

### PnLCardData Interface

```typescript
interface PnLCardData {
  pairName: string;                // Trading pair name (e.g., "SOL/USDC")
  pnlUsd: number;                  // PnL in USD
  pnlPct?: number;                 // PnL percentage (optional)
  depositedUsd?: number;           // Initial deposit in USD (optional)
  binStep?: number;                // DLMM bin step (optional)
  baseFeePct?: number;             // Base fee percentage (optional)
  openedAt?: number;               // Opening timestamp in seconds (optional)
  closedAt?: number;               // Closing timestamp in seconds (optional)
  currentValueUsd?: number;        // Current position value in USD (optional)
  feesEarnedUsd?: number;          // Fees earned in USD (optional)
  positionAgeSeconds?: number;     // Position age in seconds (optional)
  walletAddress?: string;          // Wallet address (optional)
  poolAddress?: string;            // Pool address (optional)
}
```

### PnLRendererOptions Interface

```typescript
interface PnLRendererOptions {
  theme?: 'dark' | 'orange' | 'green' | 'purple';  // Card theme
  currency?: 'USD' | 'IDR';                        // Currency for display
  rate?: number;                                   // USD to IDR conversion rate
  bgPath?: string;                                 // Custom background image path
  user?: {
    avatarUrl?: string;                            // User avatar URL
    displayName?: string;                          // User display name
  };
  hiddenFields?: Set<string>;                      // Fields to hide (e.g., 'details')
  width?: number;                                  // Card width in pixels
  height?: number;                                 // Card height in pixels
}
```

### CanvasPnLRenderer Class

```typescript
class CanvasPnLRenderer {
  constructor();
  generateCard(data: PnLCardData, options?: PnLRendererOptions): Promise<Buffer>;
  describe(): string;
}

// Factory function
function createCanvasPnLRenderer(): CanvasPnLRenderer;
```

## Themes

### Dark Theme
Clean, professional look with neutral colors. Ideal for general use.

### Orange Theme
Warm, energetic colors. Great for highlighting active trading.

### Green Theme
Positive, growth-focused colors. Perfect for profitable positions.

### Purple Theme
Premium, exclusive look. Suitable for high-value positions.

## Currency Support

### USD Formatting
- `< $1K`: $123.45
- `$1K - $1M`: $12.34K, $123.45K
- `> $1M`: $1.23M, $12.34M

### IDR Formatting (Indonesian Rupiah)
- `< 1K`: Rp123
- `1K - 1M`: Rp123rb, Rp12.34rb
- `1M - 1B`: Rp1.23jt, Rp12.34jt
- `> 1B`: Rp1.23M, Rp12.34M

## Usage Examples

### 1. Basic Usage
```typescript
const renderer = createCanvasPnLRenderer();
const card = await renderer.generateCard(data, { theme: 'dark' });
```

### 2. IDR Currency with Conversion
```typescript
const card = await renderer.generateCard(data, {
  theme: 'green',
  currency: 'IDR',
  rate: 15500 // 1 USD = 15,500 IDR
});
```

### 3. Minimal Card (Hide Details)
```typescript
const card = await renderer.generateCard(data, {
  theme: 'dark',
  hiddenFields: new Set(['details'])
});
```

### 4. Custom Background
```typescript
const card = await renderer.generateCard(data, {
  theme: 'purple',
  bgPath: '/path/to/background.jpg'
});
```

### 5. With User Information
```typescript
const card = await renderer.generateCard(data, {
  theme: 'orange',
  user: {
    displayName: 'TradingMaster',
    avatarUrl: 'https://cdn.example.com/avatar.jpg'
  }
});
```

## Integration with Prabu-Siliwangi

### Integration with Meteora Module
```typescript
import { EnhancedDLMMService } from '@prabu/meteora';
import { createCanvasPnLRenderer } from '@prabu/pnl-renderer';

const meteoraService = new EnhancedDLMMService(rpcUrl);
const pnlRenderer = createCanvasPnLRenderer();

// Get position data from Meteora
const position = await meteoraService.getPositionStatus(positionKey);

// Generate PnL card
const card = await pnlRenderer.generateCard({
  pairName: `${position.tokenXSymbol}/${position.tokenYSymbol}`,
  pnlUsd: position.pnlData?.pnlUSD || 0,
  pnlPct: position.pnlData?.pnlPercent || 0,
  // ... other data
});
```

### Integration with Prabu Siliwangi
```typescript
// In prabu-siliwangi command handler
export async function handlePnLCommand(chatId: string, positionKey: string) {
  const pnlData = await fetchPnLFromMeteora(positionKey);
  const cardBuffer = await pnlRenderer.generateCard(pnlData);
  
  // Send to Telegram
  await bot.sendPhoto(chatId, cardBuffer, {
    caption: `PnL Report for ${pnlData.pairName}`
  });
}
```

## Development

### Building the Package
```bash
# Build
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm run test

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure
```
src/
├── index.ts              # Main exports
├── types.ts              # Type definitions
├── core/
│   ├── canvasRenderer.ts # Main canvas implementation
│   └── compatibility.ts  # Backward compatibility layer
└── examples/             # Usage examples
```

## Dependencies

### Required
- `@napi-rs/canvas`: Canvas implementation for Node.js
- `node-fetch`: HTTP client for fetching external resources

### Peer Dependencies (for full integration)
- `@meteora-ag/dlmm`: Meteora DLMM library
- `@solana/web3.js`: Solana blockchain interaction

## Performance

- **Card Generation**: ~100-200ms per card
- **Memory Usage**: ~10-20MB per render process
- **Concurrency**: Supports multiple concurrent renders
- **Caching**: Implement caching for repeated renders with same data

## Error Handling

The renderer includes comprehensive error handling:

```typescript
try {
  const card = await renderer.generateCard(data, options);
} catch (error) {
  if (error.code === 'FONT_LOAD_ERROR') {
    console.warn('Fonts not loaded, using system fonts');
  } else if (error.code === 'IMAGE_LOAD_ERROR') {
    console.warn('Background image failed to load, using gradient');
  } else {
    throw error; // Re-throw unknown errors
  }
}
```

## Testing

Run the test suite:
```bash
npm test
```

Test coverage includes:
- Unit tests for formatting functions
- Integration tests for canvas rendering
- Theme validation tests
- Currency conversion tests

## License

MIT - Part of the Prabu-Siliwangi ecosystem
```

<details>
<summary>Migration Guide</summary>

### From Legacy Version

If you're upgrading from a legacy version:

```typescript
// Old way
import { createPnLRenderer } from '@prabu/pnl-renderer';
const renderer = createPnLRenderer();

// New way
import { createCanvasPnLRenderer } from '@prabu/pnl-renderer';
const renderer = createCanvasPnLRenderer();

// All existing options and data structures remain compatible
```

### Breaking Changes

1. **Font Loading**: Fonts are now loaded automatically from `@fontsource` packages
2. **Theme Colors**: Theme color definitions have been enhanced with better contrast
3. **Error Handling**: More specific error codes for better debugging

### New Features

1. **Additional Themes**: Purple theme added
2. **Custom Backgrounds**: Support for custom background images
3. **Hidden Fields**: Ability to hide specific sections
4. **User Info**: Support for user avatars and display names
5. **Currency Conversion**: Real-time USD/IDR conversion
</details>