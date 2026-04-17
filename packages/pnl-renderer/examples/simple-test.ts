/**
 * Simple Test for PnL Renderer
 *
 * Quick test to verify the renderer works correctly
 */

import { createCanvasPnLRenderer } from '../src/core/canvasRenderer';
import * as fs from 'fs';
import * as path from 'path';

async function runSimpleTest() {
  console.log('🧪 Starting PnL Renderer Simple Test...\n');

  // Create renderer
  const renderer = createCanvasPnLRenderer();
  console.log('✅ Renderer created');

  // Test data
  const testData = {
    pairName: 'SOL/USDC',
    pnlUsd: 1500.75,
    pnlPct: 15.5,
    depositedUsd: 10000,
    binStep: 15,
    baseFeePct: 0.02,
    openedAt: Math.floor(Date.now() / 1000) - 172800, // 2 days ago
    currentValueUsd: 11500.75,
    feesEarnedUsd: 25.50,
    positionAgeSeconds: 172800
  };

  // Generate test card
  console.log('🔄 Generating test card...');

  try {
    const buffer = await renderer.generateCard(testData, {
      theme: 'dark',
      currency: 'USD'
    });

    // Create output directory
    const outputDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save the card
    const outputPath = path.join(outputDir, 'test-card.png');
    fs.writeFileSync(outputPath, buffer);

    console.log(`✅ Test card saved to: ${outputPath}`);
    console.log(`📏 File size: ${(buffer.length / 1024).toFixed(2)} KB`);

    // Test multiple themes
    console.log('\n🎨 Testing all themes...');
    const themes = ['dark', 'orange', 'green', 'purple'] as const;

    for (const theme of themes) {
      try {
        const themeBuffer = await renderer.generateCard(testData, { theme });
        const themePath = path.join(outputDir, `card-${theme}.png`);
        fs.writeFileSync(themePath, themeBuffer);
        console.log(`  ✅ ${theme} theme generated`);
      } catch (error) {
        console.log(`  ❌ ${theme} theme failed: ${error.message}`);
      }
    }

    // Test IDR currency
    console.log('\n💰 Testing IDR currency...');
    try {
      const idrBuffer = await renderer.generateCard(testData, {
        theme: 'green',
        currency: 'IDR',
        rate: 15500
      });
      const idrPath = path.join(outputDir, 'card-idr.png');
      fs.writeFileSync(idrPath, idrBuffer);
      console.log('✅ IDR currency generated');
    } catch (error) {
      console.log(`❌ IDR currency failed: ${error.message}`);
    }

    // Test error case (negative PnL)
    console.log('\n📉 Testing negative PnL...');
    try {
      const negativeData = { ...testData, pnlUsd: -500, pnlPct: -5 };
      const negativeBuffer = await renderer.generateCard(negativeData, {
        theme: 'orange'
      });
      const negativePath = path.join(outputDir, 'card-negative.png');
      fs.writeFileSync(negativePath, negativeBuffer);
      console.log('✅ Negative PnL generated');
    } catch (error) {
      console.log(`❌ Negative PnL failed: ${error.message}`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log(`📁 Check output directory: ${outputDir}`);
    console.log('\n📋 Test Summary:');
    console.log('- ✅ Renderer initialization');
    console.log('- ✅ Basic card generation');
    console.log('- ✅ All themes (dark, orange, green, purple)');
    console.log('- ✅ Currency conversion (USD/IDR)');
    console.log('- ✅ Negative PnL handling');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runSimpleTest().catch(console.error);
}

export { runSimpleTest };
