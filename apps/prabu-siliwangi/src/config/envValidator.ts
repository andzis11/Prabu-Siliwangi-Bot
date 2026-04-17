import { EnvConfig, AppConfig } from "../domain/types";
import logger from "../utils/logger";

export interface EnvValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  mode: "full" | "paper" | "readonly";
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim() !== "");
}

function looksLikeSolanaAddress(value: string | undefined): boolean {
  if (!hasValue(value)) {
    return false;
  }

  const normalized = value?.trim() || "";
  return normalized.length >= 32 && normalized.length <= 88;
}

export function validateEnv(
  env: EnvConfig,
  config: AppConfig,
): EnvValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const hasTelegramToken = hasValue(env.telegramBotToken);
  const hasPrivateKey = hasValue(env.solanaPrivateKey);
  const hasWalletAddress = hasValue(env.solanaWalletAddress);
  const hasHeliusKey = hasValue(env.heliusApiKey);
  const hasOpenRouterKey = hasValue(env.openRouterApiKey);
  const hasRustCopyEngineUrl = hasValue(env.rustCopyEngineUrl);

  const walletIntelEnabled = config.features.walletIntel;
  const meteoraEnabled = config.features.meteora;
  const pnlEnabled = config.features.pnl;
  const copytradeEnabled = config.features.copytrade;

  const needsHeliusFeatures =
    walletIntelEnabled || meteoraEnabled || pnlEnabled;
  const liveExecutionCapable = hasPrivateKey && hasHeliusKey;
  const portfolioCapable = hasWalletAddress && hasHeliusKey;

  if (!hasTelegramToken) {
    errors.push("TELEGRAM_BOT_TOKEN is required to run the Telegram control plane.");
  }

  if (hasPrivateKey && !hasHeliusKey) {
    errors.push(
      "HELIUS_API_KEY is required when SOLANA_PRIVATE_KEY is set. Live execution cannot establish an RPC connection without it.",
    );
  }

  if (hasPrivateKey && !looksLikeSolanaAddress(env.solanaPrivateKey)) {
    errors.push("SOLANA_PRIVATE_KEY appears to be invalid (unexpected length).");
  }

  if (hasWalletAddress && !looksLikeSolanaAddress(env.solanaWalletAddress)) {
    errors.push("SOLANA_WALLET_ADDRESS appears to be invalid (unexpected length).");
  }

  if (!hasPrivateKey) {
    warnings.push("SOLANA_PRIVATE_KEY is missing. Live trading is disabled.");
  }

  if (!hasWalletAddress) {
    warnings.push(
      "SOLANA_WALLET_ADDRESS is missing. Portfolio, holdings, and wallet-linked analysis will be limited.",
    );
  }

  if (needsHeliusFeatures && !hasHeliusKey) {
    warnings.push(
      "HELIUS_API_KEY is missing. Wallet Intel, Meteora, and Portfolio features will be limited.",
    );
  }

  if (config.ai.provider === "openrouter" && !hasOpenRouterKey) {
    warnings.push(
      "OPENROUTER_API_KEY is missing. AI features will return placeholder responses.",
    );
  }

  if (copytradeEnabled && !hasRustCopyEngineUrl) {
    warnings.push(
      "RUST_COPY_ENGINE_URL is missing. Copy trading will not work.",
    );
  }

  if (!portfolioCapable && pnlEnabled) {
    warnings.push(
      "PnL and portfolio screens need both SOLANA_WALLET_ADDRESS and HELIUS_API_KEY for live snapshots.",
    );
  }

  if (!liveExecutionCapable) {
    warnings.push("Running in PAPER MODE because live execution config is incomplete.");
  }

  let mode: "full" | "paper" | "readonly" = "full";

  if (errors.length > 0) {
    mode = "readonly";
  } else if (!liveExecutionCapable) {
    mode = "paper";
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    mode,
  };
}

export function logValidationResult(
  result: EnvValidationResult,
): void {
  if (result.errors.length > 0) {
    logger.error("Environment validation failed:", {
      errors: result.errors,
    });
  }

  if (result.warnings.length > 0) {
    logger.warn("Environment validation warnings:", {
      warnings: result.warnings,
    });
  }

  logger.info("Environment validation result:", {
    ok: result.ok,
    mode: result.mode,
  });

  if (!result.ok) {
    logger.error(
      "Bot will start in READONLY MODE. Fix errors to enable full functionality.",
    );
  } else if (result.mode === "paper") {
    logger.info("Bot will start in PAPER MODE. Live trading is disabled.");
  } else {
    logger.info("Environment validation passed. Full functionality available.");
  }
}
