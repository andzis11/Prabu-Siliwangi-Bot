export * from "./types";
export * from "./core/dlmm";
export * from "./core/enhanced-dlmm";
export * from "./core/compatibility";

export function describeMeteora(): string {
  return "Meteora DLMM Module - Handles pool screening, liquidity management, automated strategies, wallet management, and extreme mode with auto-rebalance.";
}

// Re-export commonly used types and enums for convenience
import { StrategyType } from "@meteora-ag/dlmm";
export { StrategyType };

// Default export for backward compatibility
import { UnifiedDLMMService } from "./core/compatibility";
export default UnifiedDLMMService;
