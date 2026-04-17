/**
 * Copy Trade Dashboard
 *
 * Real-time position tracking, wallet management, and trade analytics.
 */

import { RustCopyEngineClient } from "../../integrations/rust-engine/client";
import { EnhancedDLMMService } from "@prabu/meteora";
import { logger } from "../../utils/logger";

export interface TrackedPosition {
  positionKey: string;
  poolAddress: string;
  tokenSymbol: string;
  entryPrice: number;
  currentPrice: number;
  pnlSol: number;
  pnlPct: number;
  inRange: boolean;
  binRange: string;
  amount: number;
  updatedAt: string;
}

export interface WalletStats {
  walletAddress: string;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolumeSol: number;
  totalPnlSol: number;
  winRate: number;
  avgTradeSize: number;
  bestTrade: number;
  worstTrade: number;
}

export interface TradeRecord {
  signature: string;
  timestamp: string;
  wallet: string;
  tokenMint: string;
  tokenSymbol: string;
  direction: "buy" | "sell";
  amountSol: number;
  amountTokens: number;
  price: number;
  pnlSol: number;
  pnlPct: number;
  status: "success" | "failed" | "pending";
  bundler?: string;
}

export interface DashboardData {
  positions: TrackedPosition[];
  wallets: WalletStats[];
  recentTrades: TradeRecord[];
  summary: {
    totalPnlSol: number;
    totalPnlPct: number;
    activePositions: number;
    totalVolumeSol: number;
    winRate: number;
  };
}

export class CopyTradeDashboard {
  private rustClient: RustCopyEngineClient;
  private dlmmService: EnhancedDLMMService;
  private positionsCache: Map<string, TrackedPosition> = new Map();
  private tradeHistory: TradeRecord[] = [];
  private walletStats: Map<string, WalletStats> = new Map();

  constructor(rustClient: RustCopyEngineClient, dlmmService: EnhancedDLMMService) {
    this.rustClient = rustClient;
    this.dlmmService = dlmmService;
  }

  async getDashboard(): Promise<DashboardData> {
    await this.refreshPositions();
    await this.refreshStats();

    return {
      positions: Array.from(this.positionsCache.values()),
      wallets: Array.from(this.walletStats.values()),
      recentTrades: this.tradeHistory.slice(0, 20),
      summary: this.calculateSummary(),
    };
  }

  async refreshPositions(): Promise<void> {
    try {
      const subscriptions = await this.rustClient.listSubscriptions();

      for (const sub of subscriptions) {
        const positions = await this.getPositionsForWallet(sub.wallet_address);
        for (const pos of positions) {
          this.positionsCache.set(pos.positionKey, pos);
        }
      }
    } catch (error) {
      logger.error("Failed to refresh positions", { error });
    }
  }

  async refreshStats(): Promise<void> {
    try {
      const subscriptions = await this.rustClient.listSubscriptions();

      for (const sub of subscriptions) {
        const stats = await this.getWalletStats(sub.wallet_address);
        if (stats) {
          this.walletStats.set(sub.wallet_address, stats);
        }
      }
    } catch (error) {
      logger.error("Failed to refresh wallet stats", { error });
    }
  }

  private async getPositionsForWallet(walletAddress: string): Promise<TrackedPosition[]> {
    const positions: TrackedPosition[] = [];

    try {
      const status = await this.rustClient.getStatus();

      if (status && typeof status === 'object' && 'active_trades' in status) {
        const activeTrades = (status as any).active_trades;
        if (Array.isArray(activeTrades)) {
          for (const pos of activeTrades) {
            const position: TrackedPosition = {
              positionKey: pos.position_key || pos.address || "",
              poolAddress: pos.pool_address || "",
              tokenSymbol: pos.token_symbol || "UNKNOWN",
              entryPrice: pos.entry_price || 0,
              currentPrice: pos.current_price || pos.entry_price || 0,
              pnlSol: pos.pnl_sol || 0,
              pnlPct: pos.pnl_pct || 0,
              inRange: pos.in_range ?? true,
              binRange: pos.bin_range || "N/A",
              amount: pos.amount || 0,
              updatedAt: new Date().toISOString(),
            };

            positions.push(position);
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to get positions for wallet", { wallet: walletAddress.slice(0, 8) });
    }

    return positions;
  }

  private async getWalletStats(walletAddress: string): Promise<WalletStats | null> {
    try {
      const status = await this.rustClient.getStatus();

      if (!status) {
        return null;
      }

      const totalTrades = status.total_trades_today || 0;
      const totalVolume = status.total_volume_today_sol || 0;
      const pnl = status.pnl_today_sol || 0;

      return {
        walletAddress,
        totalTrades,
        successfulTrades: status.active_trades || 0,
        failedTrades: 0,
        totalVolumeSol: totalVolume,
        totalPnlSol: pnl,
        winRate: 0,
        avgTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
        bestTrade: pnl,
        worstTrade: pnl ? -Math.abs(pnl) : 0,
      };
    } catch {
      return null;
    }
  }

  private calculateSummary(): DashboardData["summary"] {
    const positions = Array.from(this.positionsCache.values());
    const stats = Array.from(this.walletStats.values());

    const totalPnlSol = stats.reduce((sum, s) => sum + s.totalPnlSol, 0);
    const totalVolume = stats.reduce((sum, s) => sum + s.totalVolumeSol, 0);
    const totalTrades = stats.reduce((sum, s) => sum + s.totalTrades, 0);
    const successfulTrades = stats.reduce((sum, s) => sum + s.successfulTrades, 0);

    return {
      totalPnlSol,
      totalPnlPct: totalVolume > 0 ? (totalPnlSol / totalVolume) * 100 : 0,
      activePositions: positions.length,
      totalVolumeSol: totalVolume,
      winRate: totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0,
    };
  }

  addTradeRecord(trade: TradeRecord): void {
    this.tradeHistory.unshift(trade);
    if (this.tradeHistory.length > 100) {
      this.tradeHistory = this.tradeHistory.slice(0, 100);
    }
  }

  getPosition(positionKey: string): TrackedPosition | undefined {
    return this.positionsCache.get(positionKey);
  }

  getAllPositions(): TrackedPosition[] {
    return Array.from(this.positionsCache.values());
  }

  getTradesByToken(tokenMint: string): TradeRecord[] {
    return this.tradeHistory.filter(t => t.tokenMint === tokenMint);
  }

  getTradesByWallet(walletAddress: string): TradeRecord[] {
    return this.tradeHistory.filter(t => t.wallet === walletAddress);
  }

  clearCache(): void {
    this.positionsCache.clear();
  }
}

export function createCopyTradeDashboard(
  rustClient: RustCopyEngineClient,
  dlmmService: EnhancedDLMMService
): CopyTradeDashboard {
  return new CopyTradeDashboard(rustClient, dlmmService);
}
