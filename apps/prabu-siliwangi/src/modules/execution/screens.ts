/**
 * Execution Screens
 *
 * Telegram UI formatters for position execution.
 */

import type { Position, ExecutionResult } from "./service";

export function formatOpenPositions(positions: Position[]): string {
  if (positions.length === 0) {
    return "📭 No open positions";
  }

  const lines = ["*Open Positions*\n"];

  for (const pos of positions) {
    const pnlEmoji = pos.pnlPct >= 0 ? "🟢" : "🔴";
    const statusEmoji = pos.status === "open" ? "📊" : "⏳";

    lines.push(
      `${statusEmoji} *${pos.tokenSymbol}*`,
      `   💰 Amount: ${pos.amountSol.toFixed(4)} SOL`,
      `   ${pnlEmoji} P&L: ${pos.pnlPct >= 0 ? "+" : ""}${pos.pnlPct.toFixed(2)}%`,
      `   📍 Entry: ${pos.entryPrice.toFixed(6)}`,
      pos.stopLoss ? `   🛑 SL: ${pos.stopLoss}%` : "",
      pos.takeProfit ? `   🎯 TP: ${pos.takeProfit}%` : "",
      `   🕐 ${formatTimeAgo(pos.entryTime)}`,
      ""
    );
  }

  return lines.join("\n");
}

export function formatPositionDetails(position: Position): string {
  const pnlEmoji = position.pnlPct >= 0 ? "🟢" : "🔴";

  return [
    `*Position: ${position.tokenSymbol}*`,
    "",
    `📍 Pool: \`${position.poolAddress.slice(0, 8)}...${position.poolAddress.slice(-6)}\``,
    `💰 Amount: ${position.amountSol.toFixed(4)} SOL`,
    `📊 Entry Price: ${position.entryPrice.toFixed(6)}`,
    position.exitPrice ? `📤 Exit Price: ${position.exitPrice.toFixed(6)}` : "",
    "",
    `${pnlEmoji} *P&L:*`,
    `   SOL: ${position.pnlSol >= 0 ? "+" : ""}${position.pnlSol.toFixed(4)}`,
    `   %: ${position.pnlPct >= 0 ? "+" : ""}${position.pnlPct.toFixed(2)}%`,
    "",
    `⚙️ Settings:`,
    `   Stop Loss: ${position.stopLoss ? `${position.stopLoss}%` : "Not set"}`,
    `   Take Profit: ${position.takeProfit ? `${position.takeProfit}%` : "Not set"}`,
    "",
    `📅 Opened: ${formatDate(position.entryTime)}`,
    position.exitTime ? `📅 Closed: ${formatDate(position.exitTime)}` : "",
    `   Status: ${position.status.toUpperCase()}`,
  ].join("\n");
}

export function formatExecutionResult(result: ExecutionResult): string {
  const statusEmoji = result.success ? "✅" : "❌";
  const directionEmoji = result.direction === "buy" ? "📥" : "📤";

  return [
    `${statusEmoji} *Execution ${result.success ? "Success" : "Failed"}*`,
    "",
    `${directionEmoji} ${result.direction.toUpperCase()}`,
    `   Token: ${result.tokenSymbol}`,
    `   Amount: ${result.amountSol.toFixed(4)} SOL`,
    `   Pool: \`${result.poolAddress.slice(0, 8)}...${result.poolAddress.slice(-6)}\``,
    result.signature ? `   📝 Sig: \`${result.signature.slice(0, 8)}...\`` : "",
    result.error ? `\n❌ Error: ${result.error}` : "",
    "",
    `🕐 ${formatTimeAgo(result.timestamp)}`,
  ].join("\n");
}

export function formatExecutionHistory(history: ExecutionResult[]): string {
  if (history.length === 0) {
    return "📭 No execution history";
  }

  const lines = ["*Execution History*\n"];

  for (const result of history.slice(-10).reverse()) {
    const statusEmoji = result.success ? "✅" : "❌";
    const directionEmoji = result.direction === "buy" ? "📥" : "📤";

    lines.push(
      `${statusEmoji}${directionEmoji} ${result.tokenSymbol} - ${result.amountSol.toFixed(4)} SOL`,
      `   ${formatTimeAgo(result.timestamp)}`
    );
  }

  return lines.join("\n");
}

export function formatExecutionSummary(summary: {
  openPositions: number;
  totalPnlSol: number;
  executionsToday: number;
  successRate: number;
}): string {
  const pnlEmoji = summary.totalPnlSol >= 0 ? "🟢" : "🔴";

  return [
    "*Execution Summary*",
    "",
    `📊 Open Positions: ${summary.openPositions}`,
    `${pnlEmoji} Total P&L: ${summary.totalPnlSol >= 0 ? "+" : ""}${summary.totalPnlSol.toFixed(4)} SOL`,
    `📈 Executions Today: ${summary.executionsToday}`,
    `🎯 Success Rate: ${summary.successRate.toFixed(1)}%`,
  ].join("\n");
}

export function getExecutionMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Open Positions", callback_data: "action:exec_positions" }],
        [{ text: "📜 History", callback_data: "action:exec_history" }],
        [{ text: "📈 Summary", callback_data: "action:exec_summary" }],
        [{ text: "💰 Quick Buy", callback_data: "action:exec_quick_buy" }],
        [{ text: "📤 Quick Sell", callback_data: "action:exec_quick_sell" }],
        [{ text: "⬅️ Back", callback_data: "menu:automation" }],
      ],
    },
  };
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

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}
