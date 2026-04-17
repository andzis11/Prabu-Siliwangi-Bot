/**
 * PnL Renderer Module
 *
 * Main exports for the PnL rendering package.
 * Provides card generation for trading performance visualization.
 */

// Export types
export * from "./types";

// Export core renderer implementation
export {
  CanvasPnLRenderer,
  createCanvasPnLRenderer,
  type PnLCardData,
  type PnLTheme,
  type PnLRendererOptions,
  type ThemeColors
} from "./core/canvasRenderer";

// Export compatibility layer for backward compatibility
export {
  createPnLRenderer,
  type PnLRenderer as LegacyPnLRenderer
} from "./core/compatibility";

/**
 * Describe the PnL Renderer module
 */
export function describePnLRenderer(): string {
  return "PnL Renderer Module - Generates visual cards for trading performance with multiple themes, currencies, and customization options.";
}

// Default export for convenience
export { CanvasPnLRenderer as default } from "./core/canvasRenderer";
