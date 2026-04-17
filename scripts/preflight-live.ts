import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadEnv } from "../apps/kabayan-bot/src/config/env";
import { loadAppConfig } from "../apps/kabayan-bot/src/config/userConfig";
import { validateEnv } from "../apps/kabayan-bot/src/config/envValidator";
import {
  createWalletConfig,
  getWalletBalance,
} from "../apps/kabayan-bot/src/config/wallet";
import { fetchSwapQuotePreview } from "../apps/kabayan-bot/src/execution/swap";
import { OpenRouterClient } from "../apps/kabayan-bot/src/integrations/ai/openrouterClient";
import { RustCopyEngineClient } from "../apps/kabayan-bot/src/integrations/rust-engine/client";

async function main(): Promise<void> {
  const env = loadEnv();
  const config = loadAppConfig();
  const validation = validateEnv(env, config);

  console.log("=== ENV VALIDATION ===");
  console.log(JSON.stringify(validation, null, 2));
  console.log();

  if (!validation.ok) {
    throw new Error("Environment validation failed. Fix errors before live execution.");
  }

  const wallet = createWalletConfig();
  const balance = await getWalletBalance(wallet.connection, wallet.walletPublicKey);
  const balanceLamports = Math.round(balance.sol * LAMPORTS_PER_SOL);
  const recommendedTestBuySol = 0.01;
  const requiredSolForTest = config.risk.gasReserve + recommendedTestBuySol;

  console.log("=== WALLET ===");
  console.log(JSON.stringify({
    walletAddress: wallet.walletAddress,
    rpcUrl: wallet.rpcUrl,
    balanceLamports,
    balanceSol: balance.sol,
    recommendedTestBuySol,
    requiredSolForTest,
  }, null, 2));
  console.log();

  const aiClient = new OpenRouterClient({
    apiKey: env.openRouterApiKey,
    baseUrl: env.openRouterBaseUrl,
    appName: env.openRouterAppName,
    siteUrl: env.openRouterSiteUrl,
    timeoutMs: config.ai.timeoutMs,
    retryCount: config.ai.retryCount,
  });
  const rustClient = new RustCopyEngineClient(env.rustCopyEngineUrl);

  console.log("=== SERVICES ===");
  console.log(JSON.stringify({
    ai: aiClient.getConfigSummary(),
    rust: await rustClient.ping(),
  }, null, 2));
  console.log();

  console.log("=== JUPITER QUOTE PREVIEW ===");
  let quoteOk = false;
  try {
    const quote = await fetchSwapQuotePreview(
      "SOL",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      recommendedTestBuySol,
      10,
    );
    quoteOk = true;
    console.log(JSON.stringify(quote, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
  }
  console.log();

  console.log("=== SUMMARY ===");
  console.log(JSON.stringify({
    envOk: validation.ok,
    liveMode: validation.mode === "full",
    walletReady: balance.sol > 0,
    balanceEnoughForRecommendedTest: balance.sol >= requiredSolForTest,
    aiReady: aiClient.isConfigured(),
    rustReachable: true,
    jupiterQuotePreviewOk: quoteOk,
  }, null, 2));
  console.log();

  if (balance.sol < requiredSolForTest) {
    console.log(
      `Warning: current balance ${balance.sol.toFixed(4)} SOL is below recommended live test threshold ${requiredSolForTest.toFixed(4)} SOL.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
