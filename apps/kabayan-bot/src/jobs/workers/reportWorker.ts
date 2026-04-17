/**
 * Report Worker
 *
 * Scheduled worker that sends daily/weekly reports via Telegram.
 */

import { BaseWorker, type WorkerConfig } from "./baseWorker";
import { DailyReportService, type ReportConfig } from "../../modules/reports/service";
import { logger } from "../../utils/logger";

export interface ReportWorkerConfig extends WorkerConfig {
  reportService: DailyReportService;
  reportType: "daily" | "weekly";
  telegramChatId: number;
}

export class ReportWorker extends BaseWorker {
  private reportService: DailyReportService;
  private reportType: "daily" | "weekly";
  private chatId: number;
  private notifyCallback?: (message: string) => Promise<void>;

  constructor(
    config: ReportWorkerConfig,
    notifyCallback?: (message: string) => Promise<void>
  ) {
    super({
      name: `ReportWorker(${config.reportType})`,
      intervalMs: config.intervalMs,
      enabled: config.enabled,
    });

    this.reportService = config.reportService;
    this.reportType = config.reportType;
    this.chatId = config.telegramChatId;
    this.notifyCallback = notifyCallback;
  }

  setNotifyCallback(callback: (message: string) => Promise<void>): void {
    this.notifyCallback = callback;
  }

  async execute(): Promise<void> {
    logger.info(`ReportWorker (${this.reportType}): Generating report`);

    try {
      let message: string;

      if (this.reportType === "daily") {
        const report = await this.reportService.generateDailyReport();
        message = this.reportService.formatDailyReport(report);
      } else {
        message = this.reportService.formatWeeklyReport();
      }

      if (message && this.notifyCallback) {
        await this.notifyCallback(message);
        logger.info(`ReportWorker (${this.reportType}): Report sent successfully`);
      }
    } catch (error) {
      logger.error(`ReportWorker (${this.reportType}): Failed to generate report`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async generateAndSendReport(bot: any): Promise<void> {
    try {
      let message: string;

      if (this.reportType === "daily") {
        const report = await this.reportService.generateDailyReport();
        message = this.reportService.formatDailyReport(report);
      } else {
        message = this.reportService.formatWeeklyReport();
      }

      await bot.sendMessage(this.chatId, message, {
        parse_mode: "Markdown",
      });

      logger.info(`Report sent to chat ${this.chatId}`);
    } catch (error) {
      logger.error("Failed to send report", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function createReportWorker(
  reportService: DailyReportService,
  reportType: "daily" | "weekly",
  chatId: number,
  intervalHours: number = 24,
  enabled: boolean = true,
  notifyCallback?: (message: string) => Promise<void>
): ReportWorker {
  return new ReportWorker(
    {
      name: `ReportWorker(${reportType})`,
      intervalMs: intervalHours * 60 * 60 * 1000,
      enabled,
      reportService,
      reportType,
      telegramChatId: chatId,
    },
    notifyCallback
  );
}
