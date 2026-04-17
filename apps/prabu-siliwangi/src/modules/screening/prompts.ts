/**
 * AI Screening Prompts
 *
 * Contains prompt templates for AI-powered pool screening
 * using OpenRouter models.
 */

import type { AIScreeningRequest, AIScreeningResponse, PoolData } from "./types";

export const SCREENING_SYSTEM_PROMPT = `You are Prabu-Siliwangi AI, a specialized DeFi analyst for Solana ecosystem.

Your role is to analyze Meteora DLMM pools and provide trading recommendations.

You must be:
- Objective and data-driven
- Risk-aware (prioritize capital preservation)
- Concise in responses

Output format: JSON only, no markdown or extra text.`;

export function buildScreeningPrompt(request: AIScreeningRequest): string {
  const { poolData, config, userContext } = request;

  const riskLabel = userContext?.riskAppetite || "balanced";

  return `Analyze this Meteora DLMM pool for potential LP investment:

POOL DATA:
- Address: ${poolData.address}
- Pair: ${poolData.tokenXSymbol}/${poolData.tokenYSymbol}
- TVL: ${formatUsd(poolData.tvl)}
- 24h Volume: ${formatUsd(poolData.volume24h)}
- 24h Fee: ${formatUsd(poolData.fee24h)}
- Organic Score: ${poolData.organicScore}/100
- Holder Count: ${poolData.holderCount.toLocaleString()}
- Market Cap: ${formatUsd(poolData.mcap)}
- Bin Step: ${poolData.binStep / 100}%
- Top 10 Holder %: ${poolData.top10HolderPct}%
- Bundlers %: ${poolData.bundlersPct}%
${poolData.launchpad ? `- Launchpad: ${poolData.launchpad}` : ""}

USER CONTEXT:
- Risk Appetite: ${riskLabel}
${userContext?.maxPositionSize ? `- Max Position: ${userContext.maxPositionSize} SOL` : ""}

FILTER RULES (already passed):
${config.minTvl ? `- Min TVL: ${formatUsd(config.minTvl)}` : ""}
${config.maxTvl ? `- Max TVL: ${formatUsd(config.maxTvl)}` : ""}
${config.minVolume ? `- Min Volume: ${formatUsd(config.minVolume)}` : ""}
${config.minHolders ? `- Min Holders: ${config.minHolders}` : ""}
${config.minMcap ? `- Min MCap: ${formatUsd(config.minMcap)}` : ""}
${config.maxMcap ? `- Max MCap: ${formatUsd(config.maxMcap)}` : ""}
${config.maxBundlersPct ? `- Max Bundlers: ${config.maxBundlersPct}%` : ""}
${config.maxTop10Pct ? `- Max Top 10: ${config.maxTop10Pct}%` : ""}

Provide your analysis in JSON format:
{
  "score": 0-100,
  "confidence": 0-100,
  "recommendation": "buy|watch|avoid|skip",
  "reason": "2-3 sentence explanation",
  "strengths": ["point 1", "point 2"],
  "risks": ["risk 1", "risk 2"],
  "warnings": ["warning 1"]
}

Scoring guide:
- 80-100: Excellent opportunity, low risk
- 60-79: Good opportunity, moderate risk  
- 40-59: Average, consider watching
- 20-39: Below average, high risk
- 0-19: Poor, avoid

Recommendation guide:
- "buy": Score >= 60, low risk indicators
- "watch": Score 40-59, some concerns
- "avoid": Score 20-39, significant risks
- "skip": Score < 20, major red flags`;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

export function parseAIScreeningResponse(content: string): AIScreeningResponse | null {
  try {
    const cleaned = content.trim().replace(/```json\n?|```\n?/g, "");
    const parsed = JSON.parse(cleaned);

    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
      recommendation: parseRecommendation(parsed.recommendation),
      reason: String(parsed.reason || "").slice(0, 500),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 5) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 3) : [],
    };
  } catch {
    return null;
  }
}

function parseRecommendation(value: string): AIScreeningResponse["recommendation"] {
  const normalized = String(value).toLowerCase().trim();
  if (normalized === "buy") return "buy";
  if (normalized === "watch") return "watch";
  if (normalized === "avoid") return "avoid";
  return "skip";
}

export const SCREENING_MODEL_CONFIG = {
  model: "openai/gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 800,
};
