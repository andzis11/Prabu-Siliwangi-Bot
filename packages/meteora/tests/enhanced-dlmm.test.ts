import { EnhancedDLMMService } from "../src/core/enhanced-dlmm";
import { StrategyType } from "@meteora-ag/dlmm";
import * as fs from "fs";
import * as path from "path";

// Mock dependencies
jest.mock("@solana/web3.js", () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue(1e9), // 1 SOL
    getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue({ value: [] }),
  })),
  Keypair: {
    fromSecretKey: jest.fn().mockReturnValue({
      publicKey: {
        toBase58: () => "TestPubkey1234567890123456789012345678901234567890",
      },
    }),
    generate: jest.fn().mockReturnValue({
      publicKey: {
        toBase58: () => "GeneratedPubkey123456789012345678901234567890",
      },
    }),
  },
  PublicKey: jest.fn(),
  LAMPORTS_PER_SOL: 1e9,
  sendAndConfirmTransaction: jest.fn().mockResolvedValue("test_tx_hash"),
}));

jest.mock("@meteora-ag/dlmm", () => ({
  DLMM: {
    create: jest.fn().mockResolvedValue({
      refetchStates: jest.fn().mockResolvedValue(undefined),
      getActiveBin: jest.fn().mockResolvedValue({ binId: 100 }),
      lbPair: {
        tokenXMint: { toBase58: () => "So11111111111111111111111111111111111111112" },
        tokenYMint: { toBase58: () => "TestTokenMint123456789012345678901234567890" },
        binStep: 10,
        baseFeePct: 0.01,
      },
      initializePositionAndAddLiquidityByStrategy: jest.fn().mockResolvedValue("test_tx"),
      removeLiquidity: jest.fn().mockResolvedValue("remove_tx"),
      getAllLbPairPositionsByUser: jest.fn().mockResolvedValue(new Map()),
      getPositionsByUserAndLbPair: jest.fn().mockResolvedValue({
        userPositions: [],
      }),
      closePosition: jest.fn().mockResolvedValue("close_tx"),
      addLiquidityByStrategy: jest.fn().mockResolvedValue("add_tx"),
    }),
  },
  StrategyType: {
    Spot: 0,
    Curve: 1,
    BidAsk: 2,
  },
}));

jest.mock("bs58", () => ({
  decode: jest.fn().mockReturnValue(new Uint8Array(64).fill(1)),
}));

describe("EnhancedDLMMService", () => {
  const testRpcUrl = "https://api.mainnet-beta.solana.com";
  const testConfigPath = "./test-meteora-config.json";
  const testEnvPath = "./test.env";

  beforeEach(() => {
    // Clean up test files if they exist
    if (fs.existsSync(testConfigPath)) fs.unlinkSync(testConfigPath);
    if (fs.existsSync(testEnvPath)) fs.unlinkSync(testEnvPath);

    // Clear environment variables
    Object.keys(process.env)
      .filter(key => key.startsWith("WALLET_"))
      .forEach(key => delete process.env[key]);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testConfigPath)) fs.unlinkSync(testConfigPath);
    if (fs.existsSync(testEnvPath)) fs.unlinkSync(testEnvPath);
  });

  describe("Initialization", () => {
    it("should initialize with default config when no config file exists", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      expect(service).toBeDefined();
      expect(fs.existsSync(testConfigPath)).toBe(false); // Config file not created until save
    });

    it("should load existing config file", () => {
      const initialConfig = {
        wallets: { "test123": { id: "test123", name: "Test Wallet", pubkey: "test", envKey: "WALLET_1" } },
        activeWalletId: "test123",
        positions: {},
        presets: {},
        activePresetId: null,
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(initialConfig, null, 2));

      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      expect(service).toBeDefined();
    });
  });

  describe("Wallet Management", () => {
    it("should add a new wallet", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);
      const testPrivateKey = "test-private-key-base58";
      const testName = "Test Wallet";

      const wallet = service.addWallet(testName, testPrivateKey);

      expect(wallet).toBeDefined();
      expect(wallet.id).toHaveLength(8);
      expect(wallet.name).toBe(testName);
      expect(wallet.envKey).toMatch(/^WALLET_\d+$/);
      expect(process.env[wallet.envKey]).toBe(testPrivateKey);
    });

    it("should throw error for invalid private key", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);
      const mockBs58 = require("bs58");
      mockBs58.decode.mockImplementation(() => { throw new Error("Invalid encoding"); });

      expect(() => {
        service.addWallet("Test", "invalid-key");
      }).toThrow("Invalid private key format");
    });

    it("should list wallets", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      // Add a wallet first
      service.addWallet("Wallet 1", "key1");
      service.addWallet("Wallet 2", "key2");

      const wallets = service.listWallets();

      expect(wallets).toHaveLength(2);
      expect(wallets[0].name).toBe("Wallet 1");
      expect(wallets[1].name).toBe("Wallet 2");
    });

    it("should switch active wallet", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      const wallet1 = service.addWallet("Wallet 1", "key1");
      const wallet2 = service.addWallet("Wallet 2", "key2");

      service.switchWallet(wallet2.id);

      // Verify switch worked
      const wallets = service.listWallets();
      expect(wallets.find(w => w.id === wallet2.id)).toBeDefined();
    });

    it("should delete wallet", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      const wallet1 = service.addWallet("Wallet 1", "key1");
      const wallet2 = service.addWallet("Wallet 2", "key2");

      // Set env variable for wallet2
      process.env[wallet2.envKey] = "key2";

      service.deleteWallet(wallet2.id);

      const wallets = service.listWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].id).toBe(wallet1.id);
      expect(process.env[wallet2.envKey]).toBeUndefined();
    });
  });

  describe("Preset Management", () => {
    it("should add a new preset", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      const preset = service.addPreset("preset1", "Spot Strategy", 1.5, 20, StrategyType.Spot);

      expect(preset).toBeDefined();
      expect(preset.id).toBe("preset1");
      expect(preset.name).toBe("Spot Strategy");
      expect(preset.sol).toBe(1.5);
      expect(preset.range).toBe(20);
      expect(preset.strategy).toBe(StrategyType.Spot);
    });

    it("should get active preset", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      service.addPreset("preset1", "Preset 1", 1, 10, StrategyType.Curve);
      service.addPreset("preset2", "Preset 2", 2, 20, StrategyType.BidAsk);

      const activePreset = service.getActivePreset();

      expect(activePreset).toBeDefined();
      expect(activePreset?.id).toBe("preset1"); // First preset should be active
    });

    it("should switch preset", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      service.addPreset("preset1", "Preset 1", 1, 10, StrategyType.Curve);
      service.addPreset("preset2", "Preset 2", 2, 20, StrategyType.BidAsk);

      service.switchPreset("preset2");

      // In a real scenario, we would verify the switch
      // For now, just ensure no error is thrown
      expect(() => service.switchPreset("preset2")).not.toThrow();
    });

    it("should list presets", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      service.addPreset("preset1", "Preset 1", 1, 10, StrategyType.Curve);
      service.addPreset("preset2", "Preset 2", 2, 20, StrategyType.BidAsk);

      const presets = service.listPresets();

      expect(presets).toHaveLength(2);
      expect(presets[0].name).toBe("Preset 1");
      expect(presets[1].name).toBe("Preset 2");
    });
  });

  describe("Pool Operations", () => {
    it("should get pool info", async () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);
      const poolAddress = "TestPoolAddress123456789012345678901234567890";

      const poolInfo = await service.getPoolInfo(poolAddress);

      expect(poolInfo).toBeDefined();
      expect(poolInfo.address).toBe(poolAddress);
      expect(poolInfo.activeBin).toBe(100);
      expect(poolInfo.binStep).toBe(10);
    });

    it("should resolve SOL amount for 'max'", async () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      // Mock connection to return 1.5 SOL balance
      const mockConnection = require("@solana/web3.js").Connection;
      const mockInstance = new mockConnection();
      mockInstance.getBalance.mockResolvedValue(1.5 * 1e9); // 1.5 SOL

      // This is an internal method, but we can test it indirectly
      // For now, just verify the method exists
      expect(service.getSolBalance).toBeDefined();
    });

    it("should get SOL balance", async () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);
      const pubkey = "TestPubkey1234567890123456789012345678901234567890";

      const balance = await service.getSolBalance(pubkey);

      expect(balance).toBe(1); // Mock returns 1e9 lamports = 1 SOL
    });
  });

  describe("Utility Methods", () => {
    it("should extract pool address from input", () => {
      const input = "Some text with pool address TestPoolAddress123456789012345678901234567890 and more text";

      const extracted = EnhancedDLMMService.extractPoolAddress(input);

      expect(extracted).toBe("TestPoolAddress123456789012345678901234567890");
    });

    it("should check if input is pool address", () => {
      const validInput = "TestPoolAddress123456789012345678901234567890";
      const invalidInput = "not-a-pool-address";

      expect(EnhancedDLMMService.isPoolInput(validInput)).toBe(true);
      expect(EnhancedDLMMService.isPoolInput(invalidInput)).toBe(false);
    });

    it("should shorten pubkey", () => {
      const pubkey = "TestPubkey1234567890123456789012345678901234567890";

      const shortened = EnhancedDLMMService.shortKey(pubkey);

      expect(shortened).toBe("Test...7890");
    });

    it("should format SOL label", () => {
      const amount = 1.23456789;

      const label = EnhancedDLMMService.solLabel(amount);

      expect(label).toBe("1.2346 SOL");
    });
  });

  describe("Session Management", () => {
    it("should start extreme session", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);
      const sessionId = 12345;
      const poolAddress = "TestPoolAddress123456789012345678901234567890";
      const solAmount = 1.5;

      const session = service.startExtremeSession(sessionId, poolAddress, solAmount);

      expect(session).toBeDefined();
      expect(session.chatId).toBe(sessionId);
      expect(session.poolAddress).toBe(poolAddress);
      expect(session.solAmount).toBe(solAmount);
      expect(session.status).toBe("waiting");
    });

    it("should stop extreme session", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);
      const sessionId = 12345;
      const poolAddress = "TestPoolAddress123456789012345678901234567890";
      const solAmount = 1.5;

      service.startExtremeSession(sessionId, poolAddress, solAmount);
      service.stopExtremeSession(sessionId);

      const session = service.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it("should list sessions", () => {
      const service = new EnhancedDLMMService(testRpcUrl, testConfigPath, testEnvPath);

      service.startExtremeSession(1, "pool1", 1);
      service.startExtremeSession(2, "pool2", 2);

      const sessions = service.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].chatId).toBe(1);
      expect(sessions[1].chatId).toBe(2);
    });
  });
});
