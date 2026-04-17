/**
 * Compatibility Layer for Backward Compatibility
 *
 * Provides backward compatible interfaces for existing code
 * while using the new CanvasPnLRenderer implementation
 */

import {
  CanvasPnLRenderer,
  createCanvasPnLRenderer,
  type PnLCardData,
  type PnLTheme,
  type PnLRendererOptions
} from './canvasRenderer';

// Legacy PnLRenderer interface for backward compatibility
export interface PnLRenderer {
  generateCard(data: PnLCardData, options?: PnLRendererOptions): Promise<Buffer>;
  describe(): string;
}

// Legacy implementation that wraps the new CanvasPnLRenderer
export class LegacyPnLRenderer implements PnLRenderer {
  private renderer: CanvasPnLRenderer;

  constructor() {
    this.renderer = createCanvasPnLRenderer();
  }

  async generateCard(data: PnLCardData, options?: PnLRendererOptions): Promise<Buffer> {
    // Map legacy options to new format if needed
    const mappedOptions: PnLRendererOptions = {
      ...options,
      // Add any necessary mappings here
    };

    return this.renderer.generateCard(data, mappedOptions);
  }

  describe(): string {
    return this.renderer.describe();
  }
}

// Factory function for backward compatibility
export function createPnLRenderer(): PnLRenderer {
  return new LegacyPnLRenderer();
}

// Re-export types for backward compatibility
export type { PnLCardData, PnLTheme, PnLRendererOptions };

// Utility function to check if renderer is working
export async function testRenderer(): Promise<boolean> {
  try {
    const renderer = createPnLRenderer();
    const testData: PnLCardData = {
      pairName: 'SOL/USDC',
      pnlUsd: 1234.56,
      pnlPct: 12.34,
      depositedUsd: 10000,
      binStep: 10,
      baseFeePct: 0.01
    };

    await renderer.generateCard(testData, { theme: 'dark' });
    return true;
  } catch (error) {
    console.error('Renderer test failed:', error);
    return false;
  }
}

// Migration helper for updating from old to new API
export function migrateToNewAPI(): {
  oldImport: string;
  newImport: string;
  changes: string[];
} {
  return {
    oldImport: `import { createPnLRenderer, PnLCardData } from '@prabu/pnl-renderer';`,
    newImport: `import { createCanvasPnLRenderer, type PnLCardData } from '@prabu/pnl-renderer';`,
    changes: [
      '1. Replace createPnLRenderer() with createCanvasPnLRenderer()',
      '2. Use CanvasPnLRenderer class directly for more features',
      '3. All existing types remain compatible',
      '4. New renderer supports additional options and themes'
    ]
  };
}
