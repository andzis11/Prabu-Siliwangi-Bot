/**
 * Auto Execute Screens
 *
 * Telegram UI for auto-execute settings.
 */

import type { AutoExecuteConfig, TrackedPosition } from "./service";

export function formatAutoExecuteStatus(config: AutoExecuteConfig): string {
  const enabled = config.enabled ? "✅ ENABLED" : "❌ DISABLED";

  return [
    `*Auto Execute Status: ${enabled}*`,
    "",
    "*Basic Settings*",
    `• Min Score: ${config.minScoreToExecute}`,
    `• Position Size: ${config.positionSizePct}%`,
    `• Max Positions: ${config.maxConcurrentPositions}`,
    "",
    "*Take Profit*",
    `• Auto TP: ${config.useTrailingTp ? "✅" : "❌"}`,
    config.useTrailingTp ? `• TP Target: ${config.fixedTpPct}%` : "",
    config.useTrailingTp ? `• Trailing TP: ${config.trailingTp.activationPct}% activate, ${config.trailingTp.callbackPct}% callback` : "",
    "",
    "*Stop Loss*",
    `• Auto SL: ${config.useTrailingSl ? "✅" : "❌"}`,
    config.useTrailingSl ? `• SL Target: ${config.fixedSlPct}%` : "",
    config.useTrailingSl ? `• Trailing SL: ${config.trailingSl.offsetPct}% from high` : "",
    "",
    "*Advanced*",
    `• DCA: ${config.useDca ? "✅" : "❌"}`,
    config.useDca ? `  - Legs: ${config.dcaConfig.legs}, ${config.dcaConfig.intervalMinutes}min apart` : "",
    `• Time Exit: ${config.useTimeExit ? "✅" : "❌"}`,
    config.useTimeExit ? `  - Max: ${config.timeExitConfig.maxHours}h` : "",
    `• Liquidity Check: ${config.useLiquidityCheck ? "✅" : "❌"}`,
    config.useLiquidityCheck ? `  - Min: ${config.liquidityConfig.minLiquiditySol} SOL` : "",
    `• Risk Calc: ${config.useRiskCalculator ? "✅" : "❌"}`,
    config.useRiskCalculator ? `  - Risk/Trade: ${config.riskConfig.riskPerTradePct}%` : "",
    "",
    "*Trading Limits*",
    `• Max/Token: ${config.tradingLimits.maxPerToken}`,
    `• Daily Limit/Token: ${config.tradingLimits.maxDailyTradesPerToken}`,
    `• Cooldown: ${config.tradingLimits.cooldownMinutes}min`,
  ].filter(Boolean).join("\n");
}

export function formatAutoPositions(positions: TrackedPosition[]): string {
  if (positions.length === 0) {
    return "📭 No active auto-execute positions";
  }

  const lines = ["*Auto-Execute Positions*\n"];

  for (const pos of positions) {
    const elapsed = getElapsedTime(pos.entryTime);
    const statusText = pos.trailingSlActive ? "🔄 Trailing SL" :
                       pos.trailingTpActive ? "🎯 Trailing TP" :
                       pos.status === "watching" ? "👀 Watching" : "❌ Closed";
    lines.push(
      `📊 *${pos.tokenSymbol}*`,
      `   Amount: ${pos.amountSol.toFixed(4)} SOL`,
      `   Entry: ${pos.entryPrice.toFixed(6)}`,
      `   High: ${pos.highPrice.toFixed(6)}`,
      `   Status: ${statusText}`,
      `   Since: ${elapsed}`,
      ""
    );
  }

  return lines.join("\n");
}

export function getAutoExecuteMenu(config: AutoExecuteConfig) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `⚡ Auto Execute ${config.enabled ? "✅" : "❌"}`, callback_data: "action:auto_toggle" },
        ],
        [
          { text: "📊 Score", callback_data: "action:auto_score" },
          { text: "💰 Size", callback_data: "action:auto_size" },
          { text: "📈 TP/SL", callback_data: "action:auto_tp_sl_menu" },
        ],
        [
          { text: `🔄 TTP ${config.useTrailingTp ? "✅" : "❌"}`, callback_data: "action:auto_ttp_toggle" },
          { text: `🔄 TSL ${config.useTrailingSl ? "✅" : "❌"}`, callback_data: "action:auto_tsl_toggle" },
        ],
        [
          { text: "💎 DCA", callback_data: "action:auto_dca_menu" },
          { text: "⏱️ Time Exit", callback_data: "action:auto_time_menu" },
        ],
        [
          { text: "💧 Liquidity", callback_data: "action:auto_liq_menu" },
          { text: "📐 Risk", callback_data: "action:auto_risk_menu" },
        ],
        [
          { text: "🚫 Limits", callback_data: "action:auto_limits_menu" },
          { text: "📊 Health", callback_data: "action:auto_health" },
        ],
        [{ text: "📋 Positions", callback_data: "action:auto_positions" }],
        [{ text: "⬅️ Back", callback_data: "menu:automation" }],
      ],
    },
  };
}

export function getTpPctMenu(currentPct: number) {
  const options = [25, 50, 75, 100, 150, 200];
  return {
    reply_markup: {
      inline_keyboard: [
        ...options.map(pct => ([
          { text: `${pct}%${pct === currentPct ? " ✅" : ""}`, callback_data: `action:auto_tp_set:${pct}` }
        ])),
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getSlPctMenu(currentPct: number) {
  const options = [5, 10, 15, 20, 25, 30];
  return {
    reply_markup: {
      inline_keyboard: [
        ...options.map(pct => ([
          { text: `${pct}%${pct === currentPct ? " ✅" : ""}`, callback_data: `action:auto_sl_set:${pct}` }
        ])),
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getSizeMenu(currentPct: number) {
  const options = [5, 10, 15, 20, 25, 50];
  return {
    reply_markup: {
      inline_keyboard: [
        ...options.map(pct => ([
          { text: `${pct}%${pct === currentPct ? " ✅" : ""}`, callback_data: `action:auto_size_set:${pct}` }
        ])),
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getScoreMenu(currentScore: number) {
  const options = [70, 75, 80, 85, 90, 95];
  return {
    reply_markup: {
      inline_keyboard: [
        ...options.map(score => ([
          { text: `${score}${score === currentScore ? " ✅" : ""}`, callback_data: `action:auto_score_set:${score}` }
        ])),
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getTrailingTpMenu(currentPct: number) {
  const options = [5, 10, 15, 20, 25, 30];
  return {
    reply_markup: {
      inline_keyboard: [
        ...options.map(pct => ([
          { text: `${pct}%${pct === currentPct ? " ✅" : ""}`, callback_data: `action:auto_ttp_set:${pct}` }
        ])),
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getTrailingSlMenu(currentPct: number) {
  const options = [3, 5, 7, 10, 15, 20];
  return {
    reply_markup: {
      inline_keyboard: [
        ...options.map(pct => ([
          { text: `${pct}%${pct === currentPct ? " ✅" : ""}`, callback_data: `action:auto_tsl_set:${pct}` }
        ])),
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getDcaMenu(config: { useDca: boolean; legs: number; legAmountPct: number; intervalMinutes: number }) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `DCA ${config.useDca ? "ON" : "OFF"} ${config.useDca ? "✅" : "❌"}`, callback_data: "action:auto_dca_toggle" },
        ],
        [
          { text: `Legs: ${config.legs}`, callback_data: "action:auto_dca_legs" },
          { text: `Interval: ${config.intervalMinutes}min`, callback_data: "action:auto_dca_interval" },
        ],
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getTimeExitMenu(config: { useTimeExit: boolean; maxHours: number; warningBeforeHours: number }) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `Time Exit ${config.useTimeExit ? "ON" : "OFF"} ${config.useTimeExit ? "✅" : "❌"}`, callback_data: "action:auto_time_toggle" },
        ],
        [
          { text: "1h", callback_data: "action:auto_time_set:1" },
          { text: "4h", callback_data: "action:auto_time_set:4" },
          { text: "8h", callback_data: "action:auto_time_set:8" },
        ],
        [
          { text: "12h", callback_data: "action:auto_time_set:12" },
          { text: "24h", callback_data: "action:auto_time_set:24" },
          { text: "48h", callback_data: "action:auto_time_set:48" },
        ],
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getLiquidityMenu(config: { useLiquidityCheck: boolean; minLiquiditySol: number }) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `Liq Check ${config.useLiquidityCheck ? "ON" : "OFF"} ${config.useLiquidityCheck ? "✅" : "❌"}`, callback_data: "action:auto_liq_toggle" },
        ],
        [
          { text: "1 SOL", callback_data: "action:auto_liq_set:1" },
          { text: "5 SOL", callback_data: "action:auto_liq_set:5" },
          { text: "10 SOL", callback_data: "action:auto_liq_set:10" },
        ],
        [
          { text: "25 SOL", callback_data: "action:auto_liq_set:25" },
          { text: "50 SOL", callback_data: "action:auto_liq_set:50" },
        ],
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function getRiskMenu(config: { useRiskCalculator: boolean; riskPerTradePct: number }) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `Risk Calc ${config.useRiskCalculator ? "ON" : "OFF"} ${config.useRiskCalculator ? "✅" : "❌"}`, callback_data: "action:auto_risk_toggle" },
        ],
        [
          { text: "1%", callback_data: "action:auto_risk_set:1" },
          { text: "2%", callback_data: "action:auto_risk_set:2" },
          { text: "3%", callback_data: "action:auto_risk_set:3" },
        ],
        [
          { text: "5%", callback_data: "action:auto_risk_set:5" },
          { text: "10%", callback_data: "action:auto_risk_set:10" },
        ],
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

function getElapsedTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function getLimitsMenu(config: {
  maxPerToken: number;
  maxDailyTradesPerToken: number;
  cooldownMinutes: number;
}) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `Max/Token: ${config.maxPerToken}`, callback_data: "action:auto_limit_max_token" },
        ],
        [
          { text: "1", callback_data: "action:auto_limit_max_token:1" },
          { text: "2", callback_data: "action:auto_limit_max_token:2" },
          { text: "3", callback_data: "action:auto_limit_max_token:3" },
        ],
        [
          { text: `Daily Limit: ${config.maxDailyTradesPerToken}`, callback_data: "action:auto_limit_daily" },
        ],
        [
          { text: "3", callback_data: "action:auto_limit_daily:3" },
          { text: "5", callback_data: "action:auto_limit_daily:5" },
          { text: "10", callback_data: "action:auto_limit_daily:10" },
        ],
        [
          { text: `Cooldown: ${config.cooldownMinutes}min`, callback_data: "action:auto_limit_cooldown" },
        ],
        [
          { text: "1min", callback_data: "action:auto_limit_cooldown:1" },
          { text: "5min", callback_data: "action:auto_limit_cooldown:5" },
          { text: "10min", callback_data: "action:auto_limit_cooldown:10" },
        ],
        [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
      ],
    },
  };
}

export function formatPositionHealth(positions: Array<{
  position: {
    tokenSymbol: string;
    entryPrice: number;
    currentPrice: number;
    totalInvestedSol: number;
  };
  health: {
    overall: number;
    pnlScore: number;
    timeScore: number;
    trendScore: number;
    recommendation: string;
  };
}>): string {
  if (positions.length === 0) {
    return "📭 No active positions to analyze";
  }

  const lines = ["*Position Health Report*\n"];

  for (const { position, health } of positions) {
    const pnlPct = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    const emoji = health.overall >= 70 ? "🟢" : health.overall >= 40 ? "🟡" : "🔴";
    const recEmoji = health.recommendation === "hold" ? "📌" :
                    health.recommendation === "add" ? "➕" :
                    health.recommendation === "reduce" ? "📉" : "🚪";

    lines.push(
      `${emoji} *${position.tokenSymbol}* (${recEmoji} ${health.recommendation.toUpperCase()})`,
      `   Health: ${health.overall}%`,
      `   PnL: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`,
      `   Invested: ${position.totalInvestedSol.toFixed(4)} SOL`,
      `   PnL Score: ${health.pnlScore} | Time: ${health.timeScore} | Trend: ${health.trendScore}`,
      ""
    );
  }

  return lines.join("\n");
}
