import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

export type OpenRouterTask = "screening" | "management" | "general";

export interface OpenRouterClientOptions {
  apiKey?: string;
  baseUrl: string;
  appName?: string;
  siteUrl?: string;
  timeoutMs?: number;
  retryCount?: number;
}

export interface OpenRouterTaskRequest {
  task: OpenRouterTask;
  model: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface OpenRouterTaskResponse {
  provider: "openrouter";
  task: OpenRouterTask;
  model: string;
  ok: boolean;
  content: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * OpenRouter Client - AI Provider abstraction layer
 * 
 * Handles communication with OpenRouter API for various AI tasks:
 * - screening: Pool/token screening and scoring
 * - management: Position management decisions (hold/trim/close)
 * - general: Chat, summarization, explanations
 */
export class OpenRouterClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly appName: string;
  private readonly siteUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(options: OpenRouterClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.appName = options.appName ?? "Prabu-Siliwangi";
    this.siteUrl = options.siteUrl ?? "http://localhost";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryCount = options.retryCount ?? 2;
  }

  /**
   * Check if client is properly configured with API key
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.baseUrl);
  }

  /**
   * Get configuration summary for debugging/logging
   */
  getConfigSummary(): Record<string, unknown> {
    return {
      provider: "openrouter",
      configured: this.isConfigured(),
      baseUrl: this.baseUrl,
      appName: this.appName,
      siteUrl: this.siteUrl,
      timeoutMs: this.timeoutMs,
      retryCount: this.retryCount,
    };
  }

  /**
   * Make HTTP request to OpenRouter API with retry logic
   */
  private async makeRequest(
    model: string,
    prompt: string,
    retryAttempt: number = 0,
  ): Promise<{ content: string; error?: string }> {
    try {
      logger.info(`OpenRouter API call (attempt ${retryAttempt + 1})`, {
        model,
        promptLength: prompt.length,
      });

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": this.siteUrl,
            "X-Title": this.appName,
          },
          timeout: this.timeoutMs,
        },
      );

      // Parse response
      const choices = response.data?.choices;
      if (choices && choices.length > 0) {
        const content = choices[0]?.message?.content;
        if (content) {
          logger.info("OpenRouter API call successful", {
            model,
            contentLength: content.length,
          });
          return { content };
        }
      }

      logger.warn("OpenRouter response missing content", {
        model,
        responseData: response.data,
      });
      return { content: "", error: "Response missing content" };

    } catch (error) {
      const axiosError = error as AxiosError;
      
      logger.error("OpenRouter API call failed", {
        model,
        attempt: retryAttempt + 1,
        status: axiosError.response?.status,
        message: axiosError.message,
      });

      // Retry logic
      if (retryAttempt < this.retryCount) {
        const delayMs = Math.pow(2, retryAttempt) * 1000;
        logger.info(`Retrying OpenRouter call in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.makeRequest(model, prompt, retryAttempt + 1);
      }

      const errorMessage = axiosError.response?.data 
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message;
      
      return { content: "", error: errorMessage };
    }
  }

  /**
   * Main entry point for executing AI tasks
   */
  async callTask(request: OpenRouterTaskRequest): Promise<OpenRouterTaskResponse> {
    if (!this.isConfigured()) {
      logger.warn("OpenRouter client not configured - returning placeholder");
      return {
        provider: "openrouter",
        task: request.task,
        model: request.model,
        ok: false,
        content: "",
        error: "OPENROUTER_API_KEY not configured",
        metadata: request.metadata,
      };
    }

    const result = await this.makeRequest(request.model, request.prompt);

    if (result.error) {
      logger.error(`OpenRouter task failed: ${request.task}`, {
        task: request.task,
        model: request.model,
        error: result.error,
      });

      return {
        provider: "openrouter",
        task: request.task,
        model: request.model,
        ok: false,
        content: "",
        error: result.error,
        metadata: request.metadata,
      };
    }

    return {
      provider: "openrouter",
      task: request.task,
      model: request.model,
      ok: true,
      content: result.content,
      metadata: request.metadata,
    };
  }

  /**
   * Screening task - for pool/token screening and scoring
   */
  async screening(
    model: string,
    prompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<OpenRouterTaskResponse> {
    return this.callTask({
      task: "screening",
      model,
      prompt,
      metadata,
    });
  }

  /**
   * Management task - for position decisions (hold/trim/close)
   */
  async management(
    model: string,
    prompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<OpenRouterTaskResponse> {
    return this.callTask({
      task: "management",
      model,
      prompt,
      metadata,
    });
  }

  /**
   * General task - for chat, summarization, explanations
   */
  async general(
    model: string,
    prompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<OpenRouterTaskResponse> {
    return this.callTask({
      task: "general",
      model,
      prompt,
      metadata,
    });
  }
}

export default OpenRouterClient;
