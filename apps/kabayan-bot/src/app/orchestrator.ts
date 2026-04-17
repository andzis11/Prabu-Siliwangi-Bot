import { TelegramGateway } from "../bot/telegram";
import { AppConfig, EnvConfig } from "../domain/types";
import { OpenRouterClient } from "../integrations/ai/openrouterClient";
import { RustCopyEngineClient } from "../integrations/rust-engine/client";
import { Scheduler } from "../jobs/scheduler";
import { EnhancedDLMMService } from "@prabu/meteora";
import { PnLRenderer } from "@prabu/pnl-renderer";
import { AIRouterEngine } from "@prabu/ai-router";
import logger from "../utils/logger";

export class AppOrchestrator {
  constructor(
    private readonly env: EnvConfig,
    private readonly config: AppConfig,
    private readonly telegram: TelegramGateway,
    private readonly scheduler: Scheduler,
    private readonly aiClient: AIRouterEngine,
    private readonly rustClient: RustCopyEngineClient,
    private readonly dlmmService: EnhancedDLMMService,
    private readonly pnlRenderer: PnLRenderer,
  ) {}

  async bootstrap(): Promise<void> {
    logger.info("Bootstrapping Prabu-Siliwangi...", {
      nodeEnv: this.env.nodeEnv,
      port: this.env.port,
      aiProvider: this.config.ai.provider,
      features: this.config.features,
      rustCopyEngineUrl: this.env.rustCopyEngineUrl,
    });

    const rustStatus = await this.rustClient.ping();
    logger.info("Rust copy engine status checked", rustStatus);

    logger.info("Meteora module initialized", {
      status: this.config.features.meteora ? "enabled" : "disabled",
      description: this.dlmmService ? "DLMM Service loaded" : "DLMM Service missing"
    });

    logger.info("PnL renderer initialized", {
      status: this.config.features.pnl ? "enabled" : "disabled",
      description: this.pnlRenderer.describe()
    });

    logger.info("AI router status", {
      ...this.aiClient.getConfigSummary(),
      provider: this.config.ai.provider,
      screeningModel: this.config.ai.models.screeningModel,
      managementModel: this.config.ai.models.managementModel,
      generalModel: this.config.ai.models.generalModel,
    });

    this.scheduler.start();
    this.telegram.start();

    logger.info("Prabu-Siliwangi bootstrap completed");
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down Prabu-Siliwangi...");
    this.scheduler.stop();
    logger.info("Prabu-Siliwangi shutdown completed");
  }
}
