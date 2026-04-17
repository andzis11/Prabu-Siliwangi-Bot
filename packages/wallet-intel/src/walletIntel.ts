/**
 * Wallet Intelligence Service
 *
 * Main service for analyzing Solana wallets:
 * - Funding source analysis
 * - Identity/label lookup
 * - Bundle/bot detection
 * - Token transfer analysis
 */

import { HeliusClient, createHeliusClient } from "./helius";

export interface WalletIntelSummary {
  walletAddress: string;
  riskLevel: "low" | "medium" | "high" | "unknown";
  fundingSource?: FundingInfo;
  identity?: IdentityInfo;
  suspicious: boolean;
  suspiciousReason?: string;
  tokenTransfers?: TokenTransferInfo[];
  tokenBundled?: BundledInfo;
  notes: string[];
}

export interface FundingInfo {
  funder: string;
  funderName?: string;
  funderType?: string;
  amount: number;
  timestamp: number;
  signature: string;
  isBundled: boolean;
}

export interface IdentityInfo {
  name?: string;
  category?: string;
  type?: string;
}

export interface TokenTransferInfo {
  mint: string;
  amount: number;
  direction: "in" | "out";
  counterparty: string;
  signature: string;
  timestamp: number;
}

export interface BundledInfo {
  isBundled: boolean;
  distributor?: string;
  recipientCount?: number;
}

export interface WalletIntelOptions {
  heliusApiKey: string;
}

export class WalletIntelService {
  private readonly helius: HeliusClient;

  constructor(options: WalletIntelOptions) {
    this.helius = createHeliusClient({ apiKey: options.heliusApiKey });
  }

  /**
   * Check if service is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.helius);
  }

  /**
   * Analyze a wallet - full analysis including funding, identity, and optional token
   */
  async analyzeWallet(
    walletAddress: string,
    tokenMint?: string
  ): Promise<WalletIntelSummary> {
    const notes: string[] = [];
    let riskLevel: WalletIntelSummary["riskLevel"] = "unknown";
    let suspicious = false;
    let suspiciousReason: string | undefined;

    // 1. Get funding source
    const fundingSource = await this.helius.getFundingSource(walletAddress);
    let fundingInfo: FundingInfo | undefined;
    let isFundingBundled = false;

    if (fundingSource) {
      fundingInfo = {
        funder: fundingSource.funder,
        funderName: fundingSource.funderName,
        funderType: fundingSource.funderType,
        amount: fundingSource.amount,
        timestamp: fundingSource.timestamp,
        signature: fundingSource.signature,
        isBundled: false,
      };

      // Check if funding is bundled
      isFundingBundled = await this.helius.checkBundled(fundingSource);
      fundingInfo.isBundled = isFundingBundled;

      if (isFundingBundled) {
        suspicious = true;
        suspiciousReason = "Wallet funded by suspicious bundle/bot";
        notes.push("⚠️ Wallet funded by high-frequency distributor (likely bot)");
      }
    } else {
      notes.push("ℹ️ No direct funding source found (may be old wallet or bridged)");
    }

    // 2. Get identity
    const identity = await this.helius.getIdentity(walletAddress);
    const identityInfo: IdentityInfo | undefined = identity
      ? {
          name: identity.name,
          category: identity.category,
          type: identity.type,
        }
      : undefined;

    if (identity?.category) {
      notes.push(`ℹ️ Identity: ${identity.category}`);
    }

    // 3. Token transfer analysis (if token provided)
    let tokenTransfers: TokenTransferInfo[] | undefined;
    let tokenBundled: BundledInfo | undefined;

    if (tokenMint) {
      const transfers = await this.helius.getTokenTransfers(walletAddress, tokenMint);

      if (transfers.length > 0) {
        tokenTransfers = transfers.slice(0, 10).map((t) => ({
          mint: t.mint,
          amount: t.amount,
          direction: t.direction,
          counterparty: t.counterparty,
          signature: t.signature,
          timestamp: t.timestamp,
        }));

        // Check for token bundling
        const bundledResult = await this.helius.checkTokenBundled(
          transfers,
          walletAddress,
          tokenMint
        );

        if (bundledResult.isBundled) {
          tokenBundled = bundledResult;
          suspicious = true;
          suspiciousReason = "Token shows bundling pattern";
          notes.push(
            `⚠️ Token received from bundle distributor (${bundledResult.recipientCount} recipients)`
          );
        }
      } else {
        notes.push(`ℹ️ No transfers found for token ${tokenMint.slice(0, 4)}...`);
      }
    }

    // 4. Determine risk level
    if (suspicious) {
      riskLevel = "high";
    } else if (fundingSource && !isFundingBundled) {
      // Has legitimate funding
      if (identity?.category?.includes("Exchange")) {
        riskLevel = "low";
        notes.push("✅ Funded by known exchange");
      } else {
        riskLevel = "medium";
      }
    } else if (!fundingSource) {
      notes.push("⚠️ Cannot determine funding source - manual verification recommended");
    }

    return {
      walletAddress,
      riskLevel,
      fundingSource: fundingInfo,
      identity: identityInfo,
      suspicious,
      suspiciousReason,
      tokenTransfers,
      tokenBundled,
      notes,
    };
  }

  /**
   * Get just the funding source without full analysis
   */
  async getFundingSource(walletAddress: string): Promise<FundingInfo | null> {
    const funding = await this.helius.getFundingSource(walletAddress);
    if (!funding) return null;

    const isBundled = await this.helius.checkBundled(funding);

    return {
      funder: funding.funder,
      funderName: funding.funderName,
      funderType: funding.funderType,
      amount: funding.amount,
      timestamp: funding.timestamp,
      signature: funding.signature,
      isBundled,
    };
  }

  /**
   * Get wallet identity/labels
   */
  async getIdentity(walletAddress: string): Promise<IdentityInfo | null> {
    const identity = await this.helius.getIdentity(walletAddress);
    if (!identity) return null;

    return {
      name: identity.name,
      category: identity.category,
      type: identity.type,
    };
  }

  describe(): string {
    return "Wallet Intelligence Service - Analyzes wallet funding sources, identity, and detects bundling patterns.";
  }
}

/**
 * Create WalletIntelService instance
 */
export function createWalletIntelService(options: WalletIntelOptions): WalletIntelService {
  return new WalletIntelService(options);
}
