import * as path from "path";
import dotenv from "dotenv";
import { EnvConfig } from "../domain/types";

function resolveProjectRoot(): string {
  return path.resolve(__dirname, "../../../../");
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function toString(value: string | undefined, fallback: string): string {
if (value === undefined || value === "") {
  return fallback;
}
return value.trim();
}

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadEnv(): EnvConfig {
  const envPath = path.join(resolveProjectRoot(), ".env");
  console.log("[DEBUG] Loading .env from:", envPath);

  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.log("[DEBUG] dotenv error:", result.error.message);
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: toNumber(process.env.PORT, 3000),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.CHAT_ID,
    dailyReportChatId: process.env.DAILY_REPORT_CHAT_ID,
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
    solanaWalletAddress: process.env.SOLANA_WALLET_ADDRESS,
    heliusApiKey: process.env.HELIUS_API_KEY,
    jitoApiKey: process.env.JITO_API_KEY,
    aiProvider: (process.env.AI_PROVIDER || "openrouter") as EnvConfig["aiProvider"],
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterBaseUrl:
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openRouterAppName: process.env.OPENROUTER_APP_NAME,
    openRouterSiteUrl: process.env.OPENROUTER_SITE_URL,
    rustCopyEngineUrl:
      process.env.RUST_COPY_ENGINE_URL || "http://127.0.0.1:8787",
    rustApiKey: process.env.RUST_API_KEY || "dev_key_change_me",
    databaseUrl: process.env.DATABASE_URL,
    sqlitePath: process.env.SQLITE_PATH,
    logLevel: process.env.LOG_LEVEL || "info",
    mevEnabled: toBoolean(process.env.MEV_ENABLED, false),
    copytradeEnabled: toBoolean(process.env.COPYTRADE_ENABLED, false),
    walletIntelEnabled: toBoolean(process.env.WALLET_INTEL_ENABLED, true),
    meteoraEnabled: toBoolean(process.env.METEORA_ENABLED, true),
    pnlEnabled: toBoolean(process.env.PNL_ENABLED, true),
    encryptionKey: toString(process.env.ENCRYPTION_KEY, "default_key_change_me"),
  };
}

export default loadEnv;
