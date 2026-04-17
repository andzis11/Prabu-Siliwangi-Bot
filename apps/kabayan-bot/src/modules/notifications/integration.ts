/**
 * Worker Notification Integration
 *
 * Connects worker callbacks to the notification service.
 */

import TelegramBot from "node-telegram-bot-api";
import { NotificationService, type NotificationPreferences } from "./service";
import { ScreeningWorker, type ScreenedPool } from "../../jobs/workers/screeningWorker";
import { ManagementWorker, type PositionDecision, type PositionHealth } from "../../jobs/workers/managementWorker";
import { HealthWorker, type ServiceHealth } from "../../jobs/workers/healthWorker";
import { logger } from "../../utils/logger";

export interface WorkerNotificationConfig {
  chatId: number;
  preferences: Partial<NotificationPreferences>;
}

export function integrateScreeningWorker(
  worker: ScreeningWorker,
  bot: TelegramBot,
  config: WorkerNotificationConfig
): void {
  const notificationService = new NotificationService(bot);
  notificationService.setPreferences(config.chatId, config.preferences);

  worker.setNotifyCallback(async (pools: ScreenedPool[]) => {
    logger.info(`ScreeningWorker notification: ${pools.length} pools to notify`);
    await notificationService.notifyScreeningResults(config.chatId, pools);
  });

  logger.info(`ScreeningWorker integrated with notifications for chat ${config.chatId}`);
}

export function integrateManagementWorker(
  worker: ManagementWorker,
  bot: TelegramBot,
  config: WorkerNotificationConfig
): void {
  const notificationService = new NotificationService(bot);
  notificationService.setPreferences(config.chatId, config.preferences);

  worker.setNotifyCallback(async (decisions: PositionDecision[]) => {
    logger.info(`ManagementWorker notification: ${decisions.length} decisions to notify`);

    const positions = worker.getAllPositionsHealth();

    for (const decision of decisions) {
      const position = positions.find(p => p.positionKey === decision.positionKey);
      if (position) {
        await notificationService.notifyPositionDecision(config.chatId, decision, position);
      }
    }

    if (decisions.some(d => d.action === "emergency")) {
      const emergencyDecisions = decisions.filter(d => d.action === "emergency");
      await notificationService.notifyEmergency(
        config.chatId,
        "Position Emergency",
        `${emergencyDecisions.length} position(s) triggered emergency actions!`
      );
    }
  });

  logger.info(`ManagementWorker integrated with notifications for chat ${config.chatId}`);
}

export function integrateHealthWorker(
  worker: HealthWorker,
  bot: TelegramBot,
  config: WorkerNotificationConfig
): void {
  const notificationService = new NotificationService(bot);
  notificationService.setPreferences(config.chatId, config.preferences);

  worker.setNotifyCallback(async (issues: ServiceHealth[]) => {
    logger.info(`HealthWorker notification: ${issues.length} issues to notify`);

    const critical = issues.filter(i => i.status === "down");
    if (critical.length > 0) {
      await notificationService.notifyEmergency(
        config.chatId,
        "Service Down",
        `${critical.map(s => s.name).join(", ")} are experiencing issues!`
      );
    }

    await notificationService.notifyHealthIssues(config.chatId, issues);
  });

  logger.info(`HealthWorker integrated with notifications for chat ${config.chatId}`);
}

export function integrateAllWorkers(
  workers: {
    screening?: ScreeningWorker;
    management?: ManagementWorker;
    health?: HealthWorker;
  },
  bot: TelegramBot,
  config: WorkerNotificationConfig
): void {
  if (workers.screening) {
    integrateScreeningWorker(workers.screening, bot, config);
  }

  if (workers.management) {
    integrateManagementWorker(workers.management, bot, config);
  }

  if (workers.health) {
    integrateHealthWorker(workers.health, bot, config);
  }
}
