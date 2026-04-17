/**
 * Basic Example of PnL Renderer Usage
 *
 * Demonstrates how to use the CanvasPnLRenderer to generate PnL cards.
 */

import { createCanvasPnLRenderer, type PnLCardData } from '../src/core/canvasRenderer';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🧪 Starting PnL Renderer Basic Example...\n');

  // Create renderer instance
  const renderer = createCanvasPnLRenderer();
  console.log('✅ Renderer created:', renderer.describe());

  // Sample PnL data
  const pnlData: PnLCardData = {
    pairName: 'SOL/USDC',
    pnlUsd: 1234.56,
    pnlPct: 12.34,
    depositedUsd: 10000,
    binStep: 10,
    baseFeePct: 0.01,
    openedAt: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
    closedAt: Math.floor(Date.now() / 1000),
    currentValueUsd: 11234.56,
    feesEarnedUsd: 45.67,
    positionAgeSeconds: 86400,
    walletAddress: '7X8Z9A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0',
    poolAddress: 'DvLrUWmQ8wKgeNk1JcY8QApH7NKGjT8J7p5P8eG9tK1L'
  };

  // Generate cards with different themes
  const themes = ['dark', 'orange', 'green', 'purple'] as const;

  for (const theme of themes) {
    console.log(`\n🎨 Generating ${theme} theme card...`);

    try {
      // Generate card
      const cardBuffer = await renderer.generateCard(pnlData, {
        theme,
        currency: 'USD',
        user: {
          displayName: 'CryptoTrader42',
          avatarUrl: 'https://example.com/avatar.png'
        }
      });

      // Save to file
      const outputDir = path.join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `pnl-card-${theme}.png`);
      fs.writeFileSync(outputPath, cardBuffer);

      console.log(`✅ ${theme} card saved to: ${outputPath}`);
      console.log(`   File size: ${(cardBuffer.length / 1024).toFixed(2)} KB`);

    } catch (error) {
      console.error(`❌ Failed to generate ${theme} card:`, error.message);
    }
  }

  // Generate IDR currency example
  console.log('\n💰 Generating IDR currency example...');
  try {
    const idrBuffer = await renderer.generateCard(pnlData, {
      theme: 'green',
      currency: 'IDR',
      rate: 15000, // 1 USD = 15,000 IDR
    });

    const idrPath = path.join(__dirname, 'output', 'pnl-card-idr.png');
    fs.writeFileSync(idrPath, idrBuffer);
    console.log(`✅ IDR card saved to: ${idrPath}`);

  } catch (error) {
    console.error('❌ Failed to generate IDR card:', error.message);
  }

  // Generate with hidden details
  console.log('\n🎭 Generating minimal card (hidden details)...');
  try {
    const minimalBuffer = await renderer.generateCard(pnlData, {
      theme: 'dark',
      hiddenFields: new Set(['details']),
    });

    const minimalPath = path.join(__dirname, 'output', 'pnl-card-minimal.png');
    fs.writeFileSync(minimalPath, minimalBuffer);
    console.log(`✅ Minimal card saved to: ${minimalPath}`);

  } catch (error) {
    console.error('❌ Failed to generate minimal card:', error.message);
  }

  // Test with different data scenarios
  console.log('\n📊 Testing different PnL scenarios...');

  const scenarios = [
    {
      name: 'Negative PnL',
      data: {
        ...pnlData,
        pairName: 'BTC/USDC',
        pnlUsd: -567.89,
        pnlPct: -5.67,
        currentValueUsd: 9432.11
      }
    },
    {
      name: 'Small Profit',
      data: {
        ...pnlData,
        pairName: 'ETH/USDC',
        pnlUsd: 23.45,
        pnlPct: 0.23,
        currentValueUsd: 10023.45
      }
    },
    {
      name: 'Large Profit',
      data: {
        ...pnlData,
        pairName: 'RAY/USDC',
        pnlUsd: 50000,
        pnlPct: 500,
        currentValueUsd: 60000
      }
    }
  ];

  for (const scenario of scenarios) {
    try {
      const buffer = await renderer.generateCard(scenario.data, {
        theme: scenario.data.pnlUsd >= 0 ? 'green' : 'orange'
      });

      const scenarioPath = path.join(__dirname, 'output', `pnl-card-${scenario.name.toLowerCase().replace(/\s+/g, '-')}.png`);
      fs.writeFileSync(scenarioPath, buffer);
      console.log(`✅ ${scenario.name} card generated`);

    } catch (error) {
      console.error(`❌ Failed to generate ${scenario.name} card:`, error.message);
    }
  }

  console.log('\n🎉 All examples completed!');
  console.log(`📁 Output directory: ${path.join(__dirname, 'output')}`);
  console.log('\n📋 Summary:');
  console.log('- Multiple themes supported (dark, orange, green, purple)');
  console.log('- Currency conversion (USD/IDR)');
  console.log('- Customizable fields and hidden sections');
  console.log('- Different PnL scenarios handled');
  console.log('- Professional card design for trading visualization');
}

// Run example
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
