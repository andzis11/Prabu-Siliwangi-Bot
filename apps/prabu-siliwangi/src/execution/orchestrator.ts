import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "../utils/logger";
import { createTradeJournal, TradeRecord } from "../domain/tradeJournal";
import { executeSwap, SwapEnvironment, SwapResult, fetchSwapQuotePreview } from "./swap";
import { paperBuy, paperSell } from "./paper";
import { createWalletConfig, getWalletBalance } from "../config/wallet";
import { FeeMode } from "../state/manualTradeStore";

export interface TradeRequest {
  chatId: number;
  side: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol?: string;
  amount: number;
  amountUnit: 'SOL' | 'token';
  slippageBps: number;
  feeMode: FeeMode;
  notes?: string;
}

export interface TradeResponse {
  success: boolean;
  tradeId?: string;
  txHash?: string;
  method: 'paper' | 'jupiter' | 'none';
  amountExecuted: number;
  price?: number;
  priceUnit?: 'USD' | 'SOL';
  fees?: number;
  error?: string;
  warnings?: string[];
}

export interface ExecutionConfig {
  paperMode: boolean;
  safetyChecks: boolean;
  maxSlippageBps: number;
  maxTradeSizeSol: number;
  requireBalanceCheck: boolean;
}

const DEFAULT_CONFIG: ExecutionConfig = {
  paperMode: false,
  safetyChecks: true,
  maxSlippageBps: 5000, // 50%
  maxTradeSizeSol: 100,
  requireBalanceCheck: true,
};

export class TradeOrchestrator {
  private journal = createTradeJournal();
  private swapEnv: SwapEnvironment | null = null;

  constructor(private config: ExecutionConfig = DEFAULT_CONFIG) {
    if (!config.paperMode) {
      this.initializeLiveEnvironment();
    }
  }

  private initializeLiveEnvironment(): void {
    try {
      const walletConfig = createWalletConfig();
      this.swapEnv = {
        connection: walletConfig.connection,
        secretKeyBase58: walletConfig.wallet.secretKey.toString(),
      };
      logger.info('Live execution environment initialized', {
        walletAddress: walletConfig.walletAddress,
        rpcUrl: walletConfig.rpcUrl,
      });
    } catch (error) {
      logger.warn('Failed to initialize live environment, falling back to paper mode', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.config.paperMode = true;
    }
  }

  private validateRequest(request: TradeRequest): string[] {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isFinite(request.chatId) || request.chatId <= 0) {
      errors.push('Invalid chat ID');
    }

    if (!['buy', 'sell'].includes(request.side)) {
      errors.push('Invalid trade side');
    }

    if (!request.tokenMint || request.tokenMint.trim().length < 32) {
      errors.push('Invalid token mint address');
    }

    if (!Number.isFinite(request.amount) || request.amount <= 0) {
      errors.push('Invalid trade amount');
    }

    if (!['SOL', 'token'].includes(request.amountUnit)) {
      errors.push('Invalid amount unit');
    }

    if (!Number.isFinite(request.slippageBps) || request.slippageBps < 0) {
      errors.push('Invalid slippage');
    }

    if (this.config.safetyChecks) {
      if (request.slippageBps > this.config.maxSlippageBps) {
        errors.push(`Slippage (${request.slippageBps}bps) exceeds maximum allowed (${this.config.maxSlippageBps}bps)`);
      }

      // Convert to SOL for size check
      const amountSol = request.amountUnit === 'SOL' ? request.amount : request.amount * 1; // TODO: Add price conversion
      if (amountSol > this.config.maxTradeSizeSol) {
        errors.push(`Trade size (${amountSol.toFixed(4)} SOL) exceeds maximum (${this.config.maxTradeSizeSol} SOL)`);
      }
    }

    return errors;
  }

  private async checkBalance(request: TradeRequest): Promise<{ sufficient: boolean; available: number; required: number; error?: string }> {
    if (!this.config.requireBalanceCheck || request.side !== 'buy') {
      return { sufficient: true, available: 0, required: 0 };
    }

    if (this.config.paperMode) {
      // Paper mode balance check
      return { sufficient: true, available: 100, required: request.amount };
    }

    if (!this.swapEnv) {
      return { 
        sufficient: false, 
        available: 0, 
        required: request.amount,
        error: 'Live execution environment not available'
      };
    }

    try {
      const walletConfig = createWalletConfig();
      const balance = await getWalletBalance(walletConfig.connection, walletConfig.walletPublicKey);
      
      const requiredSol = request.amountUnit === 'SOL' ? request.amount : request.amount * 1; // TODO: Convert token amount to SOL
      
      return {
        sufficient: balance.sol >= requiredSol * 1.1, // 10% buffer for fees
        available: balance.sol,
        required: requiredSol,
        ...(balance.sol < requiredSol ? { 
          error: `Insufficient balance. Available: ${balance.sol.toFixed(4)} SOL, Required: ${requiredSol.toFixed(4)} SOL` 
        } : {})
      };
    } catch (error) {
      return {
        sufficient: false,
        available: 0,
        required: request.amount,
        error: `Balance check failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async getCurrentPrice(tokenMint: string): Promise<{ price: number; unit: 'SOL' | 'USD'; source: string; timestamp: string }> {
    // TODO: Implement price fetching from Jupiter or other sources
    // For now, return placeholder
    return {
      price: 1,
      unit: 'SOL',
      source: 'placeholder',
      timestamp: new Date().toISOString(),
    };
  }

  async executeTrade(request: TradeRequest): Promise<TradeResponse> {
    const startTime = Date.now();
    
    try {
      // 1. Validation
      const errors = this.validateRequest(request);
      if (errors.length > 0) {
        return {
          success: false,
          method: 'none',
          amountExecuted: 0,
          error: `Validation failed: ${errors.join(', ')}`,
        };
      }

      // 2. Balance check
      const balanceCheck = await this.checkBalance(request);
      if (!balanceCheck.sufficient) {
        return {
          success: false,
          method: 'none',
          amountExecuted: 0,
          error: balanceCheck.error || 'Insufficient balance',
        };
      }

      // 3. Get current price for record
      const priceInfo = await this.getCurrentPrice(request.tokenMint);

      // 4. Create trade record
      const tradeRecord: Omit<TradeRecord, 'id' | 'timestamp'> = {
        chatId: request.chatId,
        side: request.side,
        tokenMint: request.tokenMint,
        tokenSymbol: request.tokenSymbol,
        amount: request.amount,
        amountUnit: request.amountUnit,
        price: priceInfo.price,
        priceUnit: priceInfo.unit,
        status: 'executing',
        mode: this.config.paperMode ? 'paper' : 'live',
        slippageBps: request.slippageBps,
        feeMode: request.feeMode,
        notes: request.notes,
      };

      const journalRecord = await this.journal.add(tradeRecord);

      // 5. Execute based on mode
      let executionResult: TradeResponse;
      
      if (this.config.paperMode) {
        executionResult = await this.executePaperTrade(request, journalRecord.id);
      } else {
        executionResult = await this.executeLiveTrade(request, journalRecord.id);
      }

      // 6. Update trade record with result
      if (executionResult.success) {
        await this.journal.updateStatus(journalRecord.id, 'completed', executionResult.txHash);
        
        if (executionResult.price) {
          await this.journal.updatePrice(journalRecord.id, executionResult.price, executionResult.priceUnit);
        }
      } else {
        await this.journal.updateStatus(journalRecord.id, 'failed');
      }

      // 7. Log execution metrics
      const duration = Date.now() - startTime;
      logger.info('Trade execution completed', {
        tradeId: journalRecord.id,
        success: executionResult.success,
        method: executionResult.method,
        durationMs: duration,
        amount: request.amount,
        tokenMint: request.tokenMint.slice(0, 8) + '...',
      });

      return {
        ...executionResult,
        tradeId: journalRecord.id,
      };

    } catch (error) {
      logger.error('Trade execution failed', {
        error: error instanceof Error ? error.message : String(error),
        request: {
          chatId: request.chatId,
          side: request.side,
          tokenMint: request.tokenMint.slice(0, 8) + '...',
          amount: request.amount,
        },
      });

      return {
        success: false,
        method: 'none',
        amountExecuted: 0,
        error: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async executePaperTrade(request: TradeRequest, tradeId: string): Promise<TradeResponse> {
    try {
      if (request.side === 'buy') {
        // For paper buy, we need a price - using placeholder 1 SOL per token
        const price = 1; // TODO: Get actual price
        const amountSol = request.amountUnit === 'SOL' ? request.amount : request.amount * price;
        
        const result = paperBuy(
          request.chatId,
          request.tokenMint,
          price,
          amountSol
        );

        if (!result.success) {
          return {
            success: false,
            method: 'paper',
            amountExecuted: 0,
            error: result.error,
          };
        }

        return {
          success: true,
          method: 'paper',
          amountExecuted: result.purchasedTokenAmount,
          price,
          priceUnit: 'SOL',
        };
      } else {
        // Paper sell
        const price = 1; // TODO: Get actual price
        const sellPercent = request.amountUnit === 'token' ? 100 : 100; // TODO: Calculate percentage
        
        const result = paperSell(
          request.chatId,
          request.tokenMint,
          price,
          sellPercent / 100
        );

        if (!result.success) {
          return {
            success: false,
            method: 'paper',
            amountExecuted: 0,
            error: result.error,
          };
        }

        return {
          success: true,
          method: 'paper',
          amountExecuted: result.soldTokenAmount,
          price,
          priceUnit: 'SOL',
        };
      }
    } catch (error) {
      return {
        success: false,
        method: 'paper',
        amountExecuted: 0,
        error: `Paper trade failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async executeLiveTrade(request: TradeRequest, tradeId: string): Promise<TradeResponse> {
    if (!this.swapEnv) {
      return {
        success: false,
        method: 'none',
        amountExecuted: 0,
        error: 'Live execution environment not available',
      };
    }

    try {
      // Convert request to Jupiter format
      const inputMint = request.side === 'buy' ? 'SOL' : request.tokenMint;
      const outputMint = request.side === 'buy' ? request.tokenMint : 'SOL';
      const amount = request.amount;
      const slippagePercent = request.slippageBps / 100;

      // Get quote preview
      const quote = await fetchSwapQuotePreview(
        inputMint,
        outputMint,
        amount,
        slippagePercent,
        9 // Default decimals for SOL
      );

      // Execute swap
      const swapResult = await executeSwap(
        this.swapEnv,
        inputMint,
        outputMint,
        amount,
        slippagePercent,
        {
          maxRetries: 3,
          skipPreflight: false,
        }
      );

      if (!swapResult.success) {
        return {
          success: false,
          method: 'jupiter',
          amountExecuted: 0,
          error: swapResult.error || 'Swap failed',
        };
      }

      // Calculate executed amount from quote
      const executedAmount = request.side === 'buy' 
        ? Number(quote.outAmountRaw) / Math.pow(10, 9) // TODO: Get actual token decimals
        : amount;

      // Calculate price
      const price = request.side === 'buy'
        ? amount / executedAmount
        : executedAmount / amount;

      return {
        success: true,
        method: 'jupiter',
        amountExecuted: executedAmount,
        txHash: swapResult.txHash || undefined,
        price,
        priceUnit: 'SOL',
      };

    } catch (error) {
      return {
        success: false,
        method: 'jupiter',
        amountExecuted: 0,
        error: `Live trade failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async getTradeHistory(chatId: number, limit: number = 20): Promise<TradeRecord[]> {
    return this.journal.findByChat(chatId, limit);
  }

  async getTradeStats(chatId?: number): Promise<import("../domain/tradeJournal").TradeStats> {
    return this.journal.getStats(chatId);
  }

  async getTradeById(id: string): Promise<TradeRecord | null> {
    return this.journal.get(id);
  }

  updateConfig(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Execution config updated', { config: this.config });
  }
}

export function createTradeOrchestrator(config?: Partial<ExecutionConfig>): TradeOrchestrator {
  return new TradeOrchestrator({ ...DEFAULT_CONFIG, ...config });
}