export interface HealthStatus {
  ok: boolean;
  source: string;
}

export interface ServiceInfo {
  name: string;
  version: string;
  status: "idle" | "starting" | "running" | "stopped" | "error";
}

export interface TimestampedRecord {
  createdAt: string;
  updatedAt?: string;
}

export interface PaginationQuery {
  limit?: number;
  offset?: number;
}

export interface ApiResult<TData> {
  ok: boolean;
  data?: TData;
  error?: string;
}

export type FeatureName =
  | "walletIntel"
  | "meteora"
  | "pnl"
  | "copytrade"
  | "ai"
  | "reporting";

export interface FeatureFlagMap {
  [key: string]: boolean;
}
