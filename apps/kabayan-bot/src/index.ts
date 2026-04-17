import { loadEnv } from "./config/env";
import { loadAppConfig } from "./config/userConfig";
import { validateEnv, logValidationResult } from "./config/envValidator";
import { createTelegramGateway } from "./bot/telegram";
import { createScheduler, createWorkerInstances, type WorkerInstances, type WorkerConfigInput } from "./jobs/scheduler";
import { AppOrchestrator } from "./app/orchestrator";
import { logger } from "./utils/logger";
import { createRuntimeControlsStore } from "./state/runtimeControls";
import { createManualTradeStore } from "./state/manualTradeStore";
import { createWalletIntelStore } from "./state/walletIntelStore";

// Import packages baru
import { createEnhancedDLMMService, type EnhancedDLMMService } from "@prabu/meteora";
import { createPnLRenderer, type PnLRenderer } from "@prabu/pnl-renderer";
import { createWalletIntelService, type WalletIntelService } from "@prabu/wallet-intel";
import { createAIRouterEngine, type AIRouterEngine } from "@prabu/ai-router";
import { createRPCAdapter, type RPCAdapter, createWalletManager, type WalletManager, createTransactionBuilder, type TransactionBuilder } from "@prabu/shared-solana";
import { RustCopyEngineClient } from "./integrations/rust-engine/client";
import { OpenRouterClient } from "./integrations/ai/openrouterClient";
import { createScreeningService, type ScreeningService } from "./modules/screening";
import { createPoolDiscoveryService } from "./modules/pool-discovery";

async function main(): Promise<void> {
  const env = loadEnv();
  const config = loadAppConfig();

  // HARDENED: Validate environment before starting
  const validationResult = validateEnv(env, config);
  logValidationResult(validationResult);

  // Don't block startup, but log warnings
  if (!validationResult.ok) {
    logger.error(
      "Critical env validation errors detected. Bot may not function properly.",
      { errors: validationResult.errors },
    );
  }

  // Initialize RPC adapter dengan failover support
  const rpcAdapter = createRPCAdapter({
    primaryUrl: env.heliusApiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${env.heliusApiKey}`
      : "https://api.mainnet-beta.solana.com",
    fallbackUrls: [
      "https://solana-api.projectserum.com",
      "https://api.mainnet-beta.solana.com"
    ],
    commitment: "confirmed",
    timeout: 30000,
    enableWebSocket: true,
  });

  logger.info("RPC Adapter initialized", {
    primaryUrl: rpcAdapter.getHealthStatus()[0]?.url,
    healthy: rpcAdapter.getHealthStatus()[0]?.healthy,
  });

  // Initialize wallet manager
  const walletManager = createWalletManager({
    secureStorage: 'env',
    encryptionKey: env.encryptionKey,
  });

  // Initialize transaction builder
  const transactionBuilder = createTransactionBuilder(rpcAdapter.getConnection());

  // Initialize AI Router Engine
  const aiRouterEngine = createAIRouterEngine({
    apiKey: env.openRouterApiKey || "",
    baseUrl: env.openRouterBaseUrl,
    timeout: 30000,
    maxRetries: 3,
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    },
  });

  // Test AI Router health
  try {
    const aiHealth = await aiRouterEngine.healthCheck();
    logger.info("AI Router Engine initialized", {
      openrouter: aiHealth.openrouter,
      overall: aiHealth.overall,
    });
  } catch (error) {
    logger.warn("AI Router Engine health check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Initialize Rust Copy Engine Client
  const rustClient = new RustCopyEngineClient(env.rustCopyEngineUrl, env.rustApiKey);

  // Initialize Wallet Intelligence Service
  const walletIntelService = createWalletIntelService({
    heliusApiKey: env.heliusApiKey,
  });

  // Initialize Enhanced DLMM Service
  const meteoraDataFile = "./meteora-data.json";
  const enhancedDLMMService = createEnhancedDLMMService(
    rpcAdapter.getConnection().rpcEndpoint,
    env.heliusApiKey,
    meteoraDataFile
  );

  // Initialize PnL Renderer
  const pnlRenderer = createPnLRenderer();

  // Initialize AI Screening Service
  const openRouterClient = new OpenRouterClient({
    apiKey: env.openRouterApiKey,
    baseUrl: env.openRouterBaseUrl,
    appName: "Prabu-Siliwangi",
    siteUrl: env.openRouterSiteUrl,
    timeoutMs: 30000,
    retryCount: 2,
  });

  const screeningService = createScreeningService({
    aiClient: openRouterClient,
    config: {
      ...config.meteora.screening,
      enabled: config.features.meteora,
    },
    appConfig: config,
  });

  // Initialize stores
  const runtimeControls = createRuntimeControlsStore(config);
  const manualTradeStore = createManualTradeStore();
  const walletIntelStore = createWalletIntelStore();

  // Initialize Pool Discovery Service
  const poolDiscovery = createPoolDiscoveryService(
    rpcAdapter.getConnection().rpcEndpoint,
    env.heliusApiKey
  );

  // Initialize workers
  const workerConfig: WorkerConfigInput = {
    health: {
      enabled: true,
      intervalMs: config.schedule.healthIntervalMin * 60 * 1000,
      rpcEndpoint: rpcAdapter.getConnection().rpcEndpoint,
      rustEngineUrl: env.rustCopyEngineUrl,
      criticalThreshold: 3000,
      warningThreshold: 1500,
    },
    screening: {
      enabled: config.features.meteora,
      intervalMs: config.schedule.screeningIntervalMin * 60 * 1000,
      poolSources: ["trending", "new"],
      maxPoolsPerRun: 10,
      minScoreToNotify: 75,
      filters: {
        minTvl: config.meteora.screening.minTvl,
        maxTvl: config.meteora.screening.maxTvl,
        minVolume: config.meteora.screening.minVolume,
        minOrganic: config.meteora.screening.minOrganic,
        maxBundlersPct: config.meteora.screening.maxBundlersPct,
        maxTop10Pct: config.meteora.screening.maxTop10Pct,
      },
    },
    management: {
      enabled: config.features.copytrade,
      intervalMs: config.schedule.managementIntervalMin * 60 * 1000,
      stopLossPct: config.meteora.management.stopLossPct,
      takeProfitPct: config.risk.stopLossPct,
      oorWaitMinutes: config.meteora.management.outOfRangeWaitMinutes,
      autoRebalance: false,
    },
  };

  const workers = createWorkerInstances(workerConfig, {
    screeningService,
    dlmmService: enhancedDLMMService,
    env,
    poolDiscovery,
  });

  const scheduler = createScheduler(config, workers);

  // Initialize Telegram Gateway dengan semua services baru
  const telegram = createTelegramGateway(
    env,
    config,
    aiRouterEngine,
    rustClient,
    runtimeControls,
    manualTradeStore,
    walletIntelStore,
    enhancedDLMMService,
    pnlRenderer,
    screeningService
  );

  telegram.integrateWorkers(workers);

  const app = new AppOrchestrator(
    env,
    config,
    telegram,
    scheduler,
    aiRouterEngine,
    rustClient,
    enhancedDLMMService,
    pnlRenderer
  );

  // Log startup dengan semua features
  logger.info("Starting Prabu-Siliwangi bot with enhanced architecture...", {
    mode: validationResult.mode,
    rpcEndpoints: rpcAdapter.getHealthStatus().map(h => ({
      url: h.url,
      healthy: h.healthy,
      latency: h.latency,
    })),
    features: {
      walletIntel: config.features.walletIntel,
      meteora: config.features.meteora,
      pnl: config.features.pnl,
      copytrade: config.features.copytrade,
      aiRouter: true,
      sharedSolana: true,
    },
    packages: {
      meteora: "EnhancedDLMMService",
      pnlRenderer: "CanvasPnLRenderer",
      walletIntel: "WalletIntelService",
      aiRouter: "AIRouterEngine",
      sharedSolana: "RPCAdapter + WalletManager + TransactionBuilder",
    },
  });

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      // Stop RPC adapter monitoring
      rpcAdapter.stopMonitoring();

      // Close all connections
      await rpcAdapter.closeAll();

      logger.info("All connections closed gracefully");
    } catch (error) {
      logger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Start the application
  await app.bootstrap();

  // Log successful startup
  logger.info("Prabu-Siliwangi bot started successfully", {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime(),
  });
}

// Error handling untuk uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason,
  });
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main().catch((error) => {
    logger.error("Fatal error during startup:", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

export default main;
