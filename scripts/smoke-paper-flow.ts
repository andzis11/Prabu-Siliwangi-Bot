import { createPnLRenderer } from "../apps/prabu-siliwangi/src/modules/pnl/renderer";
import {
  TradeJournalEntry,
  TradeJournalStore,
  formatRecentTrades,
} from "../apps/prabu-siliwangi/src/repositories/tradeJournal";
import {
  getPaperBalance,
  getPaperPositions,
  paperBuy,
  paperSell,
  resetPaper,
} from "../apps/prabu-siliwangi/src/execution/paper";

class InMemoryTradeJournal implements TradeJournalStore {
  private readonly entries: TradeJournalEntry[] = [];

  addEntry(entry: Omit<TradeJournalEntry, "id" | "timestamp">): TradeJournalEntry {
    const saved: TradeJournalEntry = {
      ...entry,
      id: `smoke_${this.entries.length + 1}`,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(saved);
    return saved;
  }

  updateEntry(
    id: string,
    updates: Partial<Pick<TradeJournalEntry, "status" | "txHash" | "error" | "completedAt">>,
  ): TradeJournalEntry | null {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return null;
    }

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
    };
    return this.entries[index];
  }

  getEntries(chatId?: number): TradeJournalEntry[] {
    if (chatId !== undefined) {
      return this.entries.filter((entry) => entry.chatId === chatId);
    }
    return [...this.entries];
  }

  getEntriesByToken(tokenMint: string): TradeJournalEntry[] {
    return this.entries.filter((entry) => entry.tokenMint === tokenMint);
  }

  getRecentEntries(limit = 20): TradeJournalEntry[] {
    return [...this.entries].slice(-limit).reverse();
  }

  exportJournal(): TradeJournalEntry[] {
    return [...this.entries];
  }
}

async function main(): Promise<void> {
  const chatId = 101;
  const tokenMint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6Qf4r7YaB1pPB263";
  const journal = new InMemoryTradeJournal();
  const pnlRenderer = createPnLRenderer({
    journal,
    walletAddress: "paper-wallet",
  });

  resetPaper(chatId, 10);

  const firstBuy = paperBuy(chatId, tokenMint, 1, 2);
  const secondBuy = paperBuy(chatId, tokenMint, 2, 1);
  const partialSell = paperSell(chatId, tokenMint, 2.4, 0.5);

  if (!firstBuy.success || !secondBuy.success || !partialSell.success) {
    throw new Error("Smoke flow failed before journal verification.");
  }

  journal.addEntry({
    chatId,
    type: "buy",
    tokenMint,
    amountSol: firstBuy.spentSol,
    amountToken: firstBuy.purchasedTokenAmount,
    feeMode: "NORMAL",
    slippageBps: 15,
    status: "success",
    method: "paper",
    metadata: {
      paperMode: true,
    },
  });

  journal.addEntry({
    chatId,
    type: "buy",
    tokenMint,
    amountSol: secondBuy.spentSol,
    amountToken: secondBuy.purchasedTokenAmount,
    feeMode: "NORMAL",
    slippageBps: 15,
    status: "success",
    method: "paper",
    metadata: {
      paperMode: true,
    },
  });

  journal.addEntry({
    chatId,
    type: "sell",
    tokenMint,
    amountToken: partialSell.soldTokenAmount,
    proceedsSol: partialSell.receivedSol,
    feeMode: "SAFE",
    slippageBps: 10,
    status: "success",
    method: "paper",
    paperPnl: partialSell.pnl,
    metadata: {
      paperMode: true,
      sellPercent: 50,
    },
  });

  const pnlSnapshot = pnlRenderer.calculateRealizedPnL(chatId);

  console.log("=== PAPER POSITIONS ===");
  console.log(JSON.stringify(getPaperPositions(chatId), null, 2));
  console.log();
  console.log("=== PAPER BALANCE ===");
  console.log(getPaperBalance(chatId).toFixed(4), "SOL");
  console.log();
  console.log("=== JOURNAL ===");
  console.log(formatRecentTrades(journal.getRecentEntries(10)));
  console.log();
  console.log("=== REALIZED PNL ===");
  console.log(JSON.stringify(pnlSnapshot, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
