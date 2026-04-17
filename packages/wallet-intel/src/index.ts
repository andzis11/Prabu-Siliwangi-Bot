// Re-export everything from walletIntel module
export {
  WalletIntelService,
  createWalletIntelService,
  type WalletIntelSummary,
  type FundingInfo,
  type IdentityInfo,
  type TokenTransferInfo,
  type BundledInfo,
  type WalletIntelOptions,
} from "./walletIntel";

// Re-export Helius client for direct access if needed
export {
  HeliusClient,
  createHeliusClient,
  type HeliusConfig,
  type FundingSource,
  type WalletIdentity,
  type TokenTransfer,
  type BundleAnalysis,
} from "./helius";

// Legacy function for backward compatibility
export function describeWalletIntel(): string {
  return "Wallet Intelligence Service - Analyzes wallet funding sources, identity, and detects bundling patterns.";
}
