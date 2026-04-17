import axios, { AxiosInstance } from "axios";
import { logger } from "../../utils/logger";

export interface RustCopyEngineHealth {
  status: string;
  service: string;
  version: string;
}

export interface CopyTradeStatus {
  subscriptions: number;
  active_trades: number;
  total_trades_today: number;
  total_volume_today_sol: number;
  pnl_today_sol: number;
}

export interface WalletSubscription {
  wallet_address: string;
  enabled: boolean;
  min_amount_sol: number;
  slippage_bps: number;
  use_jito: boolean;
}

export interface CopyTradeConfig {
  rpc_url: string;
  jito_enabled: boolean;
  default_slippage_bps: number;
  max_slippage_bps: number;
  min_trade_amount_sol: number;
  max_trade_amount_sol: number;
  auto_sell: boolean;
  auto_sell_delay_secs: number;
}

export class RustCopyEngineClient {
  private client: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        "X-API-KEY": apiKey,
      },
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async ping(): Promise<{
    ok: boolean;
    service: string;
    baseUrl: string;
    checkedAt: string;
    message: string;
  }> {
    try {
      const response = await this.client.get<RustCopyEngineHealth>("/health");
      return {
        ok: response.data.status === "ok",
        service: response.data.service,
        baseUrl: this.baseUrl,
        checkedAt: new Date().toISOString(),
        message: `Rust Copy Engine v${response.data.version} is running`,
      };
    } catch (error) {
      logger.warn("Rust Copy Engine health check failed, using placeholder", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        service: "rust-copy-engine",
        baseUrl: this.baseUrl,
        checkedAt: new Date().toISOString(),
        message:
          "Rust copy engine placeholder is reachable from the application layer.",
      };
    }
  }

  async getStatus(): Promise<CopyTradeStatus | null> {
    try {
      const response = await this.client.get<CopyTradeStatus>("/status");
      return response.data;
    } catch (error) {
      logger.error("Failed to get Rust Copy Engine status", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async addSubscription(subscription: WalletSubscription): Promise<boolean> {
    try {
      const response = await this.client.post("/subscriptions", subscription);
      return response.data.ok === true;
    } catch (error) {
      logger.error("Failed to add wallet subscription", {
        error: error instanceof Error ? error.message : String(error),
        wallet: subscription.wallet_address,
      });
      return false;
    }
  }

  async removeSubscription(walletAddress: string): Promise<boolean> {
    try {
      const response = await this.client.delete(`/subscriptions/${walletAddress}`);
      return response.data.ok === true;
    } catch (error) {
      logger.error("Failed to remove wallet subscription", {
        error: error instanceof Error ? error.message : String(error),
        wallet: walletAddress,
      });
      return false;
    }
  }

  async listSubscriptions(): Promise<WalletSubscription[]> {
    try {
      const response = await this.client.get<WalletSubscription[]>("/subscriptions");
      return response.data;
    } catch (error) {
      logger.error("Failed to list subscriptions", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async getConfig(): Promise<CopyTradeConfig | null> {
    try {
      const response = await this.client.get<CopyTradeConfig>("/config");
      return response.data;
    } catch (error) {
      logger.error("Failed to get Rust Copy Engine config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async updateConfig(config: Partial<CopyTradeConfig>): Promise<boolean> {
    try {
      const response = await this.client.post("/config", config);
      return response.data.ok === true;
    } catch (error) {
      logger.error("Failed to update Rust Copy Engine config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export default RustCopyEngineClient;
