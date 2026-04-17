import { RustCopyEngineClient } from "../../integrations/rust-engine/client";
import { logger } from "../../utils/logger";

export * from "./dashboard";
export * from "./dashboard-screens";

export interface CopyTradeStore {
  getTargetWallet(chatId: number): string | null;
  setTargetWallet(chatId: number, wallet: string): void;
  getTokenMint(chatId: number): string | null;
  setTokenMint(chatId: number, mint: string): void;
  getAmountSol(chatId: number): number | null;
  setAmountSol(chatId: number, amount: number): void;
  clearTrade(chatId: number): void;
  getPendingInput(chatId: number): string | null;
  setPendingInput(chatId: number, input: string): void;
  clearPendingInput(chatId: number): void;
}

export function createCopyTradeStore(): CopyTradeStore {
  const targetWallets = new Map<number, string>();
  const tokenMints = new Map<number, string>();
  const amountSols = new Map<number, number>();
  const pendingInputs = new Map<number, string>();

  return {
    getTargetWallet(chatId: number): string | null {
      return targetWallets.get(chatId) || null;
    },
    setTargetWallet(chatId: number, wallet: string): void {
      targetWallets.set(chatId, wallet);
      logger.info("Copy trade target wallet set", { chatId, wallet: wallet.slice(0, 8) + "..." });
    },
    getTokenMint(chatId: number): string | null {
      return tokenMints.get(chatId) || null;
    },
    setTokenMint(chatId: number, mint: string): void {
      tokenMints.set(chatId, mint);
      logger.info("Copy trade token mint set", { chatId, mint: mint.slice(0, 8) + "..." });
    },
    getAmountSol(chatId: number): number | null {
      return amountSols.get(chatId) || null;
    },
    setAmountSol(chatId: number, amount: number): void {
      amountSols.set(chatId, amount);
      logger.info("Copy trade amount set", { chatId, amount });
    },
    clearTrade(chatId: number): void {
      targetWallets.delete(chatId);
      tokenMints.delete(chatId);
      amountSols.delete(chatId);
      pendingInputs.delete(chatId);
      logger.info("Copy trade cleared", { chatId });
    },
    getPendingInput(chatId: number): string | null {
      return pendingInputs.get(chatId) || null;
    },
    setPendingInput(chatId: number, input: string): void {
      pendingInputs.set(chatId, input);
      logger.info("Copy trade pending input set", { chatId, input });
    },
    clearPendingInput(chatId: number): void {
      pendingInputs.delete(chatId);
    },
  };
}

export function formatCopyTradeDraft(
  targetWallet: string | null,
  tokenMint: string | null,
  amountSol: number | null,
): string {
  const lines = [
    "📋 COPY TRADE DRAFT",
    "",
    `👛 Target Wallet: ${targetWallet ? `${targetWallet.slice(0, 6)}...${targetWallet.slice(-4)}` : "❌ Not set"}`,
    `🪙 Token Mint: ${tokenMint ? `${tokenMint.slice(0, 6)}...${tokenMint.slice(-4)}` : "❌ Not set"}`,
    `💰 Amount: ${amountSol ? `${amountSol} SOL` : "❌ Not set"}`,
    "",
    "Status: " + (targetWallet && tokenMint && amountSol ? "✅ Ready to execute" : "⚠️ Set all fields first"),
  ];
  return lines.join("\n");
}

export function getCopyTradeMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👛 Set Target Wallet", callback_data: "action:copy_set_wallet" }],
        [{ text: "🪙 Set Token Mint", callback_data: "action:copy_set_token" }],
        [
          { text: "0.01", callback_data: "action:copy_amount:0.01" },
          { text: "0.05", callback_data: "action:copy_amount:0.05" },
          { text: "0.10", callback_data: "action:copy_amount:0.1" },
        ],
        [
          { text: "0.25", callback_data: "action:copy_amount:0.25" },
          { text: "0.50", callback_data: "action:copy_amount:0.5" },
          { text: "1.00", callback_data: "action:copy_amount:1" },
        ],
        [{ text: "✅ Execute Copy", callback_data: "action:copy_execute" }],
        [{ text: "📊 Subscription", callback_data: "action:copy_subscription" }],
        [{ text: "📈 Status", callback_data: "action:copy_status" }],
        [{ text: "📊 Dashboard", callback_data: "action:dashboard_refresh" }],
        [{ text: "🔄 Reset", callback_data: "action:copy_reset" }],
        [{ text: "⬅️ Back", callback_data: "menu:automation" }],
      ],
    },
  };
}

export function getCopySubscriptionMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Add Subscription", callback_data: "action:copy_sub_add" }],
        [{ text: "📋 List Subscriptions", callback_data: "action:copy_sub_list" }],
        [{ text: "❌ Remove Subscription", callback_data: "action:copy_sub_remove" }],
        [{ text: "▶️ Start Monitoring", callback_data: "action:copy_monitor_start" }],
        [{ text: "⏹️ Stop Monitoring", callback_data: "action:copy_monitor_stop" }],
        [{ text: "⬅️ Back", callback_data: "menu:copytrade" }],
      ],
    },
  };
}

export async function handleCopyTrade(
  bot: any,
  chatId: number,
  rustClient: RustCopyEngineClient,
  store: CopyTradeStore,
): Promise<void> {
  const targetWallet = store.getTargetWallet(chatId);
  const tokenMint = store.getTokenMint(chatId);
  const amountSol = store.getAmountSol(chatId);

  if (!targetWallet || !tokenMint || !amountSol) {
    await bot.sendMessage(
      chatId,
      "❌ Copy trade not ready.\n\n" + formatCopyTradeDraft(targetWallet, tokenMint, amountSol),
      getCopyTradeMenu(),
    );
    return;
  }

  await bot.sendMessage(chatId, "⏳ Executing copy trade...");

  try {
    const response = await fetch("http://localhost:8787/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_wallet: targetWallet,
        token_mint: tokenMint,
        direction: "Buy",
        amount_sol: amountSol,
        slippage_bps: 500,
      }),
    });

    const result = await response.json();

    if (result.ok) {
      await bot.sendMessage(
        chatId,
        [
          "✅ Copy trade executed!",
          "",
          `📝 Signature: \`${result.signature}\``,
          `💬 Message: ${result.message}`,
        ].join("\n"),
        { parse_mode: "Markdown" },
      );
      logger.info("Copy trade executed", { chatId, signature: result.signature });
    } else {
      await bot.sendMessage(
        chatId,
        [
          "❌ Copy trade failed!",
          "",
          `Error: ${result.error || result.message}`,
        ].join("\n"),
      );
      logger.error("Copy trade failed", { chatId, error: result.error });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(
      chatId,
      [
        "❌ Copy trade error!",
        "",
        `Reason: ${message}`,
        "",
        "Make sure Rust Copy Engine is running on port 8787.",
      ].join("\n"),
    );
    logger.error("Copy trade error", { chatId, error: message });
  }

  await bot.sendMessage(chatId, formatCopyTradeDraft(targetWallet, tokenMint, amountSol), getCopyTradeMenu());
}

export async function handleCopySubscription(
  bot: any,
  chatId: number,
  rustClient: RustCopyEngineClient,
): Promise<void> {
  try {
    const status = await rustClient.getStatus();

    if (!status) {
      await bot.sendMessage(
        chatId,
        "❌ Cannot connect to Rust Copy Engine.\n\nMake sure the service is running on port 8787.",
      );
      return;
    }

    const message = [
      "📊 COPY TRADE STATUS",
      "",
      `👛 Active Subscriptions: ${status.subscriptions}`,
      `⚡ Active Trades: ${status.active_trades}`,
      `📈 Trades Today: ${status.total_trades_today}`,
      `💰 Volume Today: ${status.total_volume_today_sol.toFixed(4)} SOL`,
      `📈 P&L Today: ${status.pnl_today_sol >= 0 ? "+" : ""}${status.pnl_today_sol.toFixed(4)} SOL`,
    ].join("\n");

    await bot.sendMessage(chatId, message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopySubList(
  bot: any,
  chatId: number,
  rustClient: RustCopyEngineClient,
): Promise<void> {
  try {
    const subscriptions = await rustClient.listSubscriptions();

    if (subscriptions.length === 0) {
      await bot.sendMessage(
        chatId,
        "📋 No active subscriptions.\n\nUse /copy_add to add a wallet to monitor.",
      );
      return;
    }

    const lines = [
      "📋 ACTIVE SUBSCRIPTIONS",
      "",
      ...subscriptions.map((sub, i) => [
        `${i + 1}. Wallet: \`${sub.wallet_address}\``,
        `   Min Amount: ${sub.min_amount_sol} SOL`,
        `   Slippage: ${sub.slippage_bps} bps`,
        `   Jito: ${sub.use_jito ? "✅" : "❌"}`,
        "",
      ].join("\n")),
    ];

    await bot.sendMessage(chatId, lines.join(""), { parse_mode: "Markdown" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopySubAdd(
  bot: any,
  chatId: number,
  rustClient: RustCopyEngineClient,
  wallet: string,
): Promise<void> {
  try {
    const result = await rustClient.addSubscription({
      wallet_address: wallet,
      enabled: true,
      min_amount_sol: 0.01,
      slippage_bps: 500,
      use_jito: true,
    });

    if (result) {
      await bot.sendMessage(
        chatId,
        `✅ Added subscription for wallet:\n\`${wallet}\``,
        { parse_mode: "Markdown" },
      );
      logger.info("Subscription added", { chatId, wallet: wallet.slice(0, 8) + "..." });
    } else {
      await bot.sendMessage(chatId, "❌ Failed to add subscription.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopySubRemove(
  bot: any,
  chatId: number,
  rustClient: RustCopyEngineClient,
  wallet: string,
): Promise<void> {
  try {
    const result = await rustClient.removeSubscription(wallet);

    if (result) {
      await bot.sendMessage(
        chatId,
        `✅ Removed subscription for wallet:\n\`${wallet}\``,
        { parse_mode: "Markdown" },
      );
      logger.info("Subscription removed", { chatId, wallet: wallet.slice(0, 8) + "..." });
    } else {
      await bot.sendMessage(chatId, "❌ Failed to remove subscription.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopyMonitorStart(
  bot: any,
  chatId: number,
): Promise<void> {
  try {
    const response = await fetch("http://localhost:8787/monitor/start", { method: "POST" });
    const result = await response.json();

    if (result.ok) {
      await bot.sendMessage(chatId, "✅ Wallet monitoring started!");
      logger.info("Monitoring started", { chatId });
    } else {
      await bot.sendMessage(chatId, `❌ Failed: ${result.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopyMonitorStop(
  bot: any,
  chatId: number,
): Promise<void> {
  try {
    const response = await fetch("http://localhost:8787/monitor/stop", { method: "POST" });
    const result = await response.json();

    if (result.ok) {
      await bot.sendMessage(chatId, "✅ Wallet monitoring stopped!");
      logger.info("Monitoring stopped", { chatId });
    } else {
      await bot.sendMessage(chatId, `❌ Failed: ${result.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopyQuote(
  bot: any,
  chatId: number,
  tokenMint: string,
  amountSol: number,
): Promise<void> {
  try {
    await bot.sendMessage(chatId, "⏳ Getting quote...");

    const response = await fetch("http://localhost:8787/swap/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token_mint: tokenMint,
        amount_sol: amountSol,
      }),
    });

    const result = await response.json();

    if (result.ok) {
      await bot.sendMessage(
        chatId,
        [
          "📊 SWAP QUOTE",
          "",
          `🪙 Pool: ${result.pool}`,
          `💰 Estimated Tokens: ${result.estimated_tokens}`,
          `⚠️ ${result.slippage_warning}`,
        ].join("\n"),
      );
    } else {
      await bot.sendMessage(chatId, `❌ Quote failed: ${result.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }
}

export async function handleCopyBundleSwap(
  bot: any,
  chatId: number,
  store: CopyTradeStore,
): Promise<void> {
  const targetWallet = store.getTargetWallet(chatId);
  const tokenMint = store.getTokenMint(chatId);
  const amountSol = store.getAmountSol(chatId);

  if (!targetWallet || !tokenMint || !amountSol) {
    await bot.sendMessage(
      chatId,
      "❌ Copy trade not ready.\n\n" + formatCopyTradeDraft(targetWallet, tokenMint, amountSol),
      getCopyTradeMenu(),
    );
    return;
  }

  await bot.sendMessage(chatId, "⏳ Executing bundle swap via Jito...");

  try {
    const response = await fetch("http://localhost:8787/swap/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_wallet: targetWallet,
        token_mint: tokenMint,
        direction: "Buy",
        amount_sol: amountSol,
        slippage_bps: 500,
      }),
    });

    const result = await response.json();

    if (result.ok) {
      await bot.sendMessage(
        chatId,
        [
          "✅ Bundle swap executed!",
          "",
          `📝 Bundle ID: \`${result.signature}\``,
          `💬 Message: ${result.message}`,
          `⚡ Bundler: ${result.bundler}`,
        ].join("\n"),
        { parse_mode: "Markdown" },
      );
      logger.info("Bundle swap executed", { chatId, signature: result.signature });
    } else {
      await bot.sendMessage(
        chatId,
        [
          "❌ Bundle swap failed!",
          "",
          `Error: ${result.error || result.message}`,
        ].join("\n"),
      );
      logger.error("Bundle swap failed", { chatId, error: result.error });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await bot.sendMessage(chatId, `❌ Error: ${message}`);
  }

  await bot.sendMessage(chatId, formatCopyTradeDraft(targetWallet, tokenMint, amountSol), getCopyTradeMenu());
}
