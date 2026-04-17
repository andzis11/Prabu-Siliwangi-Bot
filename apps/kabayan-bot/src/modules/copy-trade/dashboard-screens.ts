/**
 * Dashboard Screens
 *
 * Telegram UI formatters for copy trade dashboard.
 */

import type { DashboardData, TrackedPosition, WalletStats, TradeRecord } from "./dashboard";

export function formatDashboardSummary(data: DashboardData): string {
  const { summary } = data;
  const pnlEmoji = summary.totalPnlSol >= 0 ? "🟢" : "🔴";

  return [
    "📊 *COPY TRADE DASHBOARD*",
    "",
    `*Summary*`,
    `${pnlEmoji} Total P&L: ${formatPnL(summary.totalPnlSol)} (${formatPnLPct(summary.totalPnlPct)})`,
    `📈 Total Volume: ${summary.totalVolumeSol.toFixed(4)} SOL`,
    `📊 Win Rate: ${summary.winRate.toFixed(1)}%`,
    `💼 Active Positions: ${summary.activePositions}`,
  ].join("\n");
}

export function formatPositionsList(positions: TrackedPosition[]): string {
  if (positions.length === 0) {
    return "📭 No active positions";
  }

  const lines = ["", "*Active Positions*", ""];

  for (const pos of positions) {
    const pnlEmoji = pos.pnlPct >= 0 ? "🟢" : "🔴";
    const rangeStatus = pos.inRange ? "✅" : "❌";

    lines.push(
      `${pnlEmoji} *${pos.tokenSymbol}*`,
      `   💰 P&L: ${formatPnL(pos.pnlSol)} (${formatPnLPct(pos.pnlPct)})`,
      `   📍 Range: ${pos.binRange} ${rangeStatus}`,
      `   💎 Amount: ${pos.amount.toFixed(4)}`,
      `   🔗 ${pos.poolAddress.slice(0, 8)}...${pos.poolAddress.slice(-6)}`,
      ""
    );
  }

  return lines.join("\n");
}

export function formatWalletStats(stats: WalletStats): string {
  return [
    `*Wallet:* \`${stats.walletAddress.slice(0, 8)}...${stats.walletAddress.slice(-6)}\``,
    "",
    `📊 Total Trades: ${stats.totalTrades}`,
    `✅ Success: ${stats.successfulTrades} | ❌ Failed: ${stats.failedTrades}`,
    `💰 Total Volume: ${stats.totalVolumeSol.toFixed(4)} SOL`,
    `📈 P&L: ${formatPnL(stats.totalPnlSol)}`,
    `🎯 Win Rate: ${stats.winRate.toFixed(1)}%`,
    `📏 Avg Trade: ${stats.avgTradeSize.toFixed(4)} SOL`,
    `🏆 Best: ${formatPnL(stats.bestTrade)} | 💸 Worst: ${formatPnL(stats.worstTrade)}`,
  ].join("\n");
}

export function formatTradeHistory(trades: TradeRecord[]): string {
  if (trades.length === 0) {
    return "📭 No trade history";
  }

  const lines = ["", "*Recent Trades*", ""];

  for (const trade of trades.slice(0, 10)) {
    const statusEmoji = trade.status === "success" ? "✅" : trade.status === "failed" ? "❌" : "⏳";
    const directionEmoji = trade.direction === "buy" ? "📥" : "📤";
    const pnlEmoji = trade.pnlSol >= 0 ? "🟢" : "🔴";

    lines.push(
      `${statusEmoji} ${directionEmoji} *${trade.tokenSymbol}*`,
      `   ${pnlEmoji} P&L: ${formatPnL(trade.pnlSol)} (${formatPnLPct(trade.pnlPct)})`,
      `   💰 ${trade.amountSol.toFixed(4)} SOL`,
      `   📝 ${trade.signature.slice(0, 8)}...`,
      `   🕐 ${formatTimeAgo(trade.timestamp)}`,
      ""
    );
  }

  return lines.join("\n");
}

export function formatFullDashboard(data: DashboardData): string {
  const parts: string[] = [];

  parts.push(formatDashboardSummary(data));
  parts.push(formatPositionsList(data.positions));

  if (data.wallets.length > 0) {
    parts.push("", "*Wallet Stats*", "");
    for (const wallet of data.wallets) {
      parts.push(formatWalletStats(wallet));
      parts.push("");
    }
  }

  return parts.join("\n");
}

export function getDashboardMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔄 Refresh", callback_data: "action:dashboard_refresh" }],
        [
          { text: "📊 Summary", callback_data: "action:dashboard_summary" },
          { text: "💼 Positions", callback_data: "action:dashboard_positions" },
        ],
        [
          { text: "📈 Wallets", callback_data: "action:dashboard_wallets" },
          { text: "📜 History", callback_data: "action:dashboard_history" },
        ],
        [{ text: "⬅️ Back", callback_data: "menu:copytrade" }],
      ],
    },
  };
}

function formatPnL(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(4)} SOL`;
}

function formatPnLPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
