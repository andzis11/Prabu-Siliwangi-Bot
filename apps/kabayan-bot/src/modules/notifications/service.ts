/**
 * Notification Service
 *
 * Handles sending alerts and notifications via Telegram.
 * Respects user preferences for alert types.
 */

import TelegramBot from "node-telegram-bot-api";
import { logger } from "../../utils/logger";
import type { ScreenedPool } from "../../jobs/workers/screeningWorker";
import type { PositionDecision, PositionHealth } from "../../jobs/workers/managementWorker";
import type { ServiceHealth } from "../../jobs/workers/healthWorker";
import type { ScreeningResult } from "../screening";

export interface NotificationPreferences {
  alerts: {
    screening: boolean;
    positionAlerts: boolean;
    healthIssues: boolean;
    emergencyOnly: boolean;
  };
  minScreeningScore: number;
}

export interface NotificationContext {
  chatId: number;
  preferences: NotificationPreferences;
}

export class NotificationService {
  private bot: TelegramBot;
  private contexts: Map<number, NotificationPreferences> = new Map();
  private defaultPreferences: NotificationPreferences = {
    alerts: {
      screening: true,
      positionAlerts: true,
      healthIssues: true,
      emergencyOnly: false,
    },
    minScreeningScore: 75,
  };

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  setPreferences(chatId: number, preferences: Partial<NotificationPreferences>): void {
    const current = this.contexts.get(chatId) || { ...this.defaultPreferences };
    this.contexts.set(chatId, {
      ...current,
      ...preferences,
      alerts: { ...current.alerts, ...preferences.alerts },
    });
  }

  getPreferences(chatId: number): NotificationPreferences {
    return this.contexts.get(chatId) || { ...this.defaultPreferences };
  }

  async notifyScreeningResults(
    chatId: number,
    pools: ScreenedPool[]
  ): Promise<void> {
    const prefs = this.getPreferences(chatId);

    if (!prefs.alerts.screening) return;

    const highQualityPools = pools.filter(p => p.score >= prefs.minScreeningScore);

    if (highQualityPools.length === 0) return;

    const header = `🔍 *New High-Quality Pools Found*\n\n`;

    for (const pool of highQualityPools.slice(0, 3)) {
      const emoji = pool.recommendation === "buy" ? "🟢" : "🟡";
      const message = [
        `${emoji} *${pool.poolData.tokenYSymbol}/SOL*`,
        `   Score: \`${pool.score}\` | Confidence: ${pool.confidence}%`,
        `   TVL: $${formatNumber(pool.poolData.tvl)} | Vol: $${formatNumber(pool.poolData.volume24h)}`,
        `   📍 ${pool.address.slice(0, 8)}...${pool.address.slice(-6)}`,
        `   💡 ${pool.reason.slice(0, 80)}${pool.reason.length > 80 ? "..." : ""}`,
        ``,
      ].join("\n");

      try {
        await this.bot.sendMessage(chatId, header + message, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
      } catch (error) {
        logger.error(`Failed to send screening notification: ${error}`);
      }
    }
  }

  async notifyPositionDecision(
    chatId: number,
    decision: PositionDecision,
    position: PositionHealth
  ): Promise<void> {
    const prefs = this.getPreferences(chatId);

    if (prefs.alerts.emergencyOnly && decision.action !== "emergency") {
      return;
    }

    if (!prefs.alerts.positionAlerts && decision.action !== "emergency") {
      return;
    }

    const emoji = getActionEmoji(decision.action);
    const urgency = decision.action === "emergency" ? "🚨 " : "";

    const message = [
      `${emoji} *Position Alert*`,
      `   Action: \`${decision.action.toUpperCase()}\``,
      `   Position: ${position.positionKey.slice(0, 8)}...`,
      `   PnL: ${formatPnL(position.pnlPct)}`,
      `   In Range: ${position.inRange ? "✅" : "❌"}`,
      `   Confidence: ${decision.confidence}%`,
      ``,
      `📝 ${decision.reason}`,
    ].join("\n");

    try {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error(`Failed to send position alert: ${error}`);
    }
  }

  async notifyHealthIssues(
    chatId: number,
    issues: ServiceHealth[]
  ): Promise<void> {
    const prefs = this.getPreferences(chatId);

    if (!prefs.alerts.healthIssues) return;

    const downServices = issues.filter(i => i.status === "down");
    const degradedServices = issues.filter(i => i.status === "degraded");

    if (downServices.length === 0 && degradedServices.length === 0) return;

    const lines: string[] = ["🩺 *System Health Alert*\n"];

    if (downServices.length > 0) {
      lines.push("🚫 *Down Services:*");
      for (const s of downServices) {
        lines.push(`   • ${s.name}: ${s.error || "Unknown error"}`);
      }
      lines.push("");
    }

    if (degradedServices.length > 0) {
      lines.push("⚠️ *Degraded Services:*");
      for (const s of degradedServices) {
        lines.push(`   • ${s.name}: ${s.latencyMs ? `Latency ${s.latencyMs}ms` : "Slow response"}`);
      }
    }

    try {
      await this.bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error(`Failed to send health alert: ${error}`);
    }
  }

  async notifyEmergency(
    chatId: number,
    title: string,
    message: string
  ): Promise<void> {
    const alertMessage = [
      "🚨🚨🚨 *EMERGENCY ALERT* 🚨🚨🚨",
      ``,
      `*${title}*`,
      ``,
      message,
    ].join("\n");

    try {
      await this.bot.sendMessage(chatId, alertMessage, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error(`Failed to send emergency alert: ${error}`);
    }
  }

  async notifyWorkerSummary(
    chatId: number,
    summary: {
      screening?: { poolsFound: number; highQuality: number };
      management?: { positions: number; decisions: number };
      health?: { healthy: number; issues: number };
    }
  ): Promise<void> {
    const lines = ["📊 *Worker Summary*\n"];

    if (summary.screening) {
      lines.push(`🔍 Screening: ${summary.screening.highQuality}/${summary.screening.poolsFound} pools passed`);
    }
    if (summary.management) {
      lines.push(`💼 Management: ${summary.management.positions} positions, ${summary.management.decisions} decisions`);
    }
    if (summary.health) {
      lines.push(`🩺 Health: ${summary.health.healthy} OK, ${summary.health.issues} issues`);
    }

    try {
      await this.bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error(`Failed to send worker summary: ${error}`);
    }
  }
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  const color = pnl >= 0 ? "🟢" : "🔴";
  return `${color} ${sign}${pnl.toFixed(2)}%`;
}

function getActionEmoji(action: string): string {
  switch (action) {
    case "emergency": return "🚨";
    case "close": return "🔴";
    case "trim": return "🟡";
    case "rebalance": return "🔄";
    default: return "📊";
  }
}
