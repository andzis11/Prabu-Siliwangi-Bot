/**
 * Screening Screens for Telegram Bot
 *
 * UI components for displaying screening results and controls.
 */

import type { ScreeningSession, ScreeningHistory, ScreeningResult } from "./types";

export function getScreeningMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Screen Pool", callback_data: "action:screen_pool" }],
        [{ text: "📊 View History", callback_data: "action:screen_history" }],
        [{ text: "⚙️ Settings", callback_data: "action:screen_settings" }],
        [{ text: "📈 Session Stats", callback_data: "action:screen_stats" }],
        [{ text: "⬅️ Back", callback_data: "menu:automation" }],
      ],
    },
  };
}

export function getScreeningSettingsMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎯 Min TVL: $10K", callback_data: "action:screen_setting:minTvl" }],
        [{ text: "📊 Min Volume: $500", callback_data: "action:screen_setting:minVolume" }],
        [{ text: "👥 Min Holders: 500", callback_data: "action:screen_setting:minHolders" }],
        [{ text: "💎 Min MCap: $150K", callback_data: "action:screen_setting:minMcap" }],
        [{ text: "⚠️ Max Bundlers: 30%", callback_data: "action:screen_setting:maxBundlers" }],
        [{ text: "👑 Max Top10: 60%", callback_data: "action:screen_setting:maxTop10" }],
        [{ text: "🔄 Reset to Defaults", callback_data: "action:screen_reset_config" }],
        [{ text: "⬅️ Back", callback_data: "action:screen_menu" }],
      ],
    },
  };
}

export function formatScreeningMenu(): string {
  return [
    "🔍 AI SCREENING",
    "",
    "AI-powered pool screening with rule-based filtering.",
    "Sistem akan filtrasi berdasarkan config, lalu scoring via AI.",
    "",
    "Workflow:",
    "1. Rule-based filter (TVL, Volume, Holders, dll)",
    "2. AI scoring & recommendation",
    "3. Output: BUY / WATCH / AVOID / SKIP",
  ].join("\n");
}

export function formatScreeningSession(session: ScreeningSession): string {
  return [
    "📈 SCREENING SESSION",
    "",
    `Session ID: ${session.id.slice(0, 8)}...`,
    `Started: ${new Date(session.startedAt).toLocaleString()}`,
    `Status: ${session.status.toUpperCase()}`,
    "",
    `Pools Scanned: ${session.poolsScanned}`,
    `Passed Rules: ${session.poolsPassed}`,
    `Failed Rules: ${session.poolsFailed}`,
    `AI Analyzed: ${session.poolsAIAnalyzed}`,
    session.lastScanAt ? `Last Scan: ${new Date(session.lastScanAt).toLocaleString()}` : "",
  ].join("\n");
}

export function formatScreeningHistory(history: ScreeningHistory[], limit = 10): string {
  if (history.length === 0) {
    return [
      "📜 SCREENING HISTORY",
      "",
      "No pools have been screened yet.",
      "Use /screen or the button to start screening.",
    ].join("\n");
  }

  const lines: string[] = [
    "📜 SCREENING HISTORY",
    "",
  ];

  for (const item of history.slice(0, limit)) {
    const rec = item.result.recommendation.toUpperCase();
    const recIcon = rec === "BUY" ? "🟢" : rec === "WATCH" ? "🟡" : rec === "AVOID" ? "🟠" : "🔴";
    const time = new Date(item.scannedAt).toLocaleString();

    lines.push(
      `${recIcon} ${rec} | Score: ${item.result.aiScore}`,
      `   Pool: ${shorten(item.poolAddress)} | ${time}`
    );
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function formatScreeningResult(result: ScreeningResult): string {
  const recIcon =
    result.recommendation === "buy"
      ? "🟢"
      : result.recommendation === "watch"
      ? "🟡"
      : result.recommendation === "avoid"
      ? "🟠"
      : "🔴";

  const lines: string[] = [
    "🔍 SCREENING RESULT",
    "",
    `📍 Pool: \`${result.poolAddress}\``,
    `🤖 AI Score: ${result.aiScore}/100`,
    `📊 Confidence: ${result.aiConfidence}%`,
    `${recIcon} Recommendation: ${result.recommendation.toUpperCase()}`,
    "",
    `💬 ${result.aiReason}`,
    "",
  ];

  if (result.failedRules.length > 0) {
    lines.push("❌ Failed Rules:");
    result.failedRules.forEach((rule) => lines.push(`  • ${rule}`));
    lines.push("");
  }

  if (result.passedRules.length > 0 && result.passedRules.length <= 6) {
    lines.push("✅ Passed Rules:");
    result.passedRules.forEach((rule) => lines.push(`  • ${rule}`));
    lines.push("");
  }

  lines.push(`⏱️ Processed in ${result.processingTimeMs}ms`);

  return lines.join("\n");
}

export function formatScreeningPrompt(poolAddress: string): string {
  return [
    "📍 SCREENING",
    "",
    "Send the Meteora pool address to screen.",
    "",
    `Example: ${shorten(poolAddress) || "Enter pool address..."}`,
  ].join("\n");
}

function shorten(address: string): string {
  if (!address || address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}
