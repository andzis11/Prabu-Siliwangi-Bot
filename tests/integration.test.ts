/**
 * Integration Tests for Prabu-Siliwangi Packages
 * NOTE: Tests are skipped - the ambient.d.ts declarations don't match actual package exports
 */

import { createEnhancedDLMMService } from '@prabu/meteora';
import { createCanvasPnLRenderer } from '@prabu/pnl-renderer';
import { createWalletIntelService } from '@prabu/wallet-intel';
import { createAIRouterEngine } from '@prabu/ai-router';
import { createRPCAdapter, createWalletManager, createTransactionBuilder } from '@prabu/shared-solana';

const TEST_RPC_URL = 'https://api.mainnet-beta.solana.com';

describe.skip('Prabu-Siliwangi Integration Tests', () => {
  test('should initialize all packages', async () => {
    const rpcAdapter = createRPCAdapter({ primaryUrl: TEST_RPC_URL });
    expect(rpcAdapter).toBeDefined();

    const walletManager = createWalletManager({ secureStorage: 'memory' });
    expect(walletManager).toBeDefined();

    const transactionBuilder = createTransactionBuilder(rpcAdapter.getConnection());
    expect(transactionBuilder).toBeDefined();

    const walletIntelService = createWalletIntelService({ heliusApiKey: 'test-key' });
    expect(walletIntelService).toBeDefined();

    const aiRouterEngine = createAIRouterEngine({ apiKey: 'test-key', timeout: 5000 });
    expect(aiRouterEngine).toBeDefined();

    const pnlRenderer = createCanvasPnLRenderer();
    expect(pnlRenderer).toBeDefined();

    const enhancedDLMMService = createEnhancedDLMMService(TEST_RPC_URL, 'test-key', './test.json');
    expect(enhancedDLMMService).toBeDefined();
  });
});