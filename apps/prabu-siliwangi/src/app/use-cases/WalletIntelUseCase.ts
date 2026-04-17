/**
 * WalletIntelUseCase - Operasi Analisa Wallet
 *
 * Bertanggung jawab untuk menangani semua operasi wallet intelligence termasuk:
 * - Analisa funding source
 * - Deteksi bundle
 * - Analisa token transfer
 * - Lookup identity/label
 * - Scoring keamanan wallet
 */

import { UseCaseResult, UseCaseContext } from "./index";
import { PublicKey } from "@solana/web3.js";

export interface WalletAnalysisRequest {
  walletAddress: string;
  tokenMint?: string; // Optional - untuk analisa token spesifik
  includeTransfers?: boolean;
  includeBundledInfo?: boolean;
}

export interface WalletAnalysisResult {
  walletAddress: string;
  riskLevel: "low" | "medium" | "high" | "unknown";
  fundingSource?: {
    funder: string;
    funderName?: string;
    funderType?: string;
    amount: number;
    timestamp: number;
    signature: string;
    isBundled: boolean;
  };
  identity?: {
    name?: string;
    category?: string;
    type?: string;
  };
  suspicious: boolean;
  suspiciousReason?: string;
  tokenTransfers?: Array<{
    mint: string;
    amount: number;
    direction: "in" | "out";
    counterparty: string;
    signature: string;
    timestamp: number;
  }>;
  tokenBundled?: {
    isBundled: boolean;
    distributor?: string;
    recipientCount?: number;
  };
  notes: string[];
  analyzedAt: number;
}

export interface WalletScoreResult {
  walletAddress: string;
  overallScore: number; // 0-100
  riskScore: number; // 0-100, higher = more risky
  trustScore: number; // 0-100, higher = more trustworthy
  factors: Array<{
    name: string;
    score: number;
    reason: string;
  }>;
}

export class WalletIntelUseCase {
  private context: UseCaseContext;

  constructor(context: UseCaseContext) {
    this.context = context;
  }

  /**
   * Analisa wallet secara lengkap
   */
  async analyzeWallet(request: WalletAnalysisRequest): Promise<UseCaseResult<WalletAnalysisResult>> {
    const { logger, walletIntelService, config } = this.context;

    try {
      // Check if wallet intel feature is enabled
      if (!config.features.walletIntel) {
        return {
          success: false,
          error: "Wallet Intel feature is disabled in config",
        };
      }

      // Validate wallet address
      try {
        new PublicKey(request.walletAddress);
      } catch {
        return {
          success: false,
          error: "Invalid wallet address",
        };
      }

      logger?.info("Starting wallet analysis", {
        walletAddress: request.walletAddress,
        tokenMint: request.tokenMint
      });

      // Use wallet intel service if available
      if (walletIntelService) {
        const result = await walletIntelService.analyzeWallet(
          request.walletAddress,
          request.tokenMint
        );

        const analysisResult: WalletAnalysisResult = {
          walletAddress: result.walletAddress,
          riskLevel: result.riskLevel,
          fundingSource: result.fundingSource,
          identity: result.identity,
          suspicious: result.suspicious,
          suspiciousReason: result.suspiciousReason,
          tokenTransfers: result.tokenTransfers,
          tokenBundled: result.tokenBundled,
          notes: result.notes,
          analyzedAt: Date.now(),
        };

        logger?.info("Wallet analysis completed", {
          walletAddress: request.walletAddress,
          riskLevel: analysisResult.riskLevel
        });

        return {
          success: true,
          data: analysisResult,
        };
      }

      // Fallback if no service available
      return {
        success: false,
        error: "Wallet Intel service not configured",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Wallet analysis failed", {
        error: errorMessage,
        walletAddress: request.walletAddress
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Hitung scoring untuk wallet
   */
  async scoreWallet(walletAddress: string): Promise<UseCaseResult<WalletScoreResult>> {
    const { logger, config } = this.context;

    try {
      // First, analyze the wallet
      const analysis = await this.analyzeWallet({ walletAddress });

      if (!analysis.success || !analysis.data) {
        return {
          success: false,
          error: analysis.error || "Failed to analyze wallet",
        };
      }

      const data = analysis.data;
      const factors: Array<{ name: string; score: number; reason: string }> = [];
      let riskScore = 0;
      let trustScore = 0;

      // Factor 1: Funding Source
      if (data.fundingSource) {
        if (data.fundingSource.isBundled) {
          riskScore += 40;
          factors.push({
            name: "Funding Source",
            score: 40,
            reason: "Wallet funded from bundled source - high risk",
          });
        } else if (data.fundingSource.funderType === "cex") {
          trustScore += 20;
          factors.push({
            name: "Funding Source",
            score: -20,
            reason: "Wallet funded from CEX - trustworthy",
          });
        } else {
          trustScore += 10;
          factors.push({
            name: "Funding Source",
            score: -10,
            reason: "Wallet has known funding source",
          });
        }
      }

      // Factor 2: Suspicious flag
      if (data.suspicious) {
        riskScore += 30;
        factors.push({
          name: "Suspicious Activity",
          score: 30,
          reason: data.suspiciousReason || "Flagged as suspicious",
        });
      }

      // Factor 3: Identity
      if (data.identity) {
        if (data.identity.category === "deployer") {
          riskScore += 20;
          factors.push({
            name: "Identity",
            score: 20,
            reason: "Token deployer - may dump",
          });
        } else if (data.identity.category === "whale") {
          trustScore += 15;
          factors.push({
            name: "Identity",
            score: -15,
            reason: "Known whale wallet",
          });
        }
      }

      // Factor 4: Bundle detection
      if (data.tokenBundled?.isBundled) {
        riskScore += 25;
        factors.push({
          name: "Bundle Detection",
          score: 25,
          reason: "Token distribution shows bundle pattern",
        });
      }

      // Clamp scores
      riskScore = Math.min(100, Math.max(0, riskScore));
      trustScore = Math.min(100, Math.max(0, trustScore));
      const overallScore = Math.max(0, 100 - riskScore + trustScore);

      const scoreResult: WalletScoreResult = {
        walletAddress,
        overallScore,
        riskScore,
        trustScore,
        factors,
      };

      logger?.info("Wallet scoring completed", {
        walletAddress,
        overallScore,
        riskScore,
        trustScore,
      });

      return {
        success: true,
        data: scoreResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Wallet scoring failed", {
        error: errorMessage,
        walletAddress
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Quick check - apakah wallet aman untuk di-copy trade
   */
  async isSafeForCopyTrade(walletAddress: string, minTrustScore: number = 60): Promise<UseCaseResult<boolean>> {
    const { logger } = this.context;

    try {
      const scoreResult = await this.scoreWallet(walletAddress);

      if (!scoreResult.success || !scoreResult.data) {
        return {
          success: false,
          error: scoreResult.error || "Failed to score wallet",
        };
      }

      const isSafe = scoreResult.data.trustScore >= minTrustScore;

      logger?.info("Copy trade safety check", {
        walletAddress,
        trustScore: scoreResult.data.trustScore,
        minRequired: minTrustScore,
        isSafe,
      });

      return {
        success: true,
        data: isSafe,
        message: isSafe
          ? `Wallet is safe for copy trade (trust score: ${scoreResult.data.trustScore})`
          : `Wallet is NOT safe for copy trade (trust score: ${scoreResult.data.trustScore})`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Copy trade safety check failed", {
        error: errorMessage,
        walletAddress
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Batch analysis untuk multiple wallets
   */
  async analyzeMultipleWallets(walletAddresses: string[]): Promise<UseCaseResult<WalletAnalysisResult[]>> {
    const { logger } = this.context;

    try {
      const results: WalletAnalysisResult[] = [];

      for (const address of walletAddresses) {
        const result = await this.analyzeWallet({ walletAddress: address });
        if (result.success && result.data) {
          results.push(result.data);
        }
      }

      logger?.info("Batch wallet analysis completed", {
        total: walletAddresses.length,
        successful: results.length,
      });

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Batch wallet analysis failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Format hasil analisa untuk tampilan Telegram
   */
  formatAnalysisForTelegram(result: WalletAnalysisResult): string {
    let message = `📊 *Wallet Analysis*\n\n`;
    message += `Address: \`${result.walletAddress}\`\n\n`;

    // Risk Level
    const riskEmoji = {
      low: "🟢",
      medium: "🟡",
      high: "🔴",
      unknown: "⚪",
    };

    message += `Risk Level: ${riskEmoji[result.riskLevel]} ${result.riskLevel.toUpperCase()}\n`;

    // Funding Source
    if (result.fundingSource) {
      message += `\n*Funding Source:*\n`;
      message += `• Funder: \`${result.fundingSource.funder}\`\n`;
      if (result.fundingSource.funderName) {
        message += `• Name: ${result.fundingSource.funderName}\n`;
      }
      message += `• Amount: ${result.fundingSource.amount} SOL\n`;
      if (result.fundingSource.isBundled) {
        message += `• ⚠️ Bundled funding detected\n`;
      }
    }

    // Identity
    if (result.identity) {
      message += `\n*Identity:*\n`;
      if (result.identity.name) {
        message += `• Name: ${result.identity.name}\n`;
      }
      if (result.identity.category) {
        message += `• Category: ${result.identity.category}\n`;
      }
    }

    // Suspicious
    if (result.suspicious) {
      message += `\n⚠️ *Suspicious:* ${result.suspiciousReason}\n`;
    }

    // Notes
    if (result.notes.length > 0) {
      message += `\n*Notes:*\n`;
      result.notes.forEach((note) => {
        message += `• ${note}\n`;
      });
    }

    return message;
  }
}

export function createWalletIntelUseCase(context: UseCaseContext): WalletIntelUseCase {
  return new WalletIntelUseCase(context);
}
