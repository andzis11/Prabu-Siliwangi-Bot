/**
 * @prabu/ai-router - AI Router Package for Prabu-Siliwangi
 *
 * Comprehensive AI routing system with OpenRouter integration, task-based routing,
 * prompt engineering, and model selection algorithms.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { EventEmitter } from 'events';

// ============ TYPES AND INTERFACES ============

export type AIProvider = 'openrouter' | 'anthropic' | 'openai' | 'google';
export type AIRouterTask = 'screening' | 'management' | 'general' | 'analysis' | 'recommendation';

export interface AIRequest {
  task: AIRouterTask;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface AIResponse {
  provider: AIProvider;
  task: AIRouterTask;
  model: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUSD?: number;
  };
  latency: number;
  metadata?: Record<string, unknown>;
}

export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

export interface PromptTemplate {
  id: string;
  task: AIRouterTask;
  template: string;
  variables: string[];
  modelPreferences: string[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelInfo {
  id: string;
  provider: AIProvider;
  contextLength: number;
  maxTokens: number;
  supportsFunctionCalling: boolean;
  costPer1kTokens: {
    input: number;
    output: number;
  };
  capabilities: string[];
}

export interface AIRouterMetrics {
  requests: number;
  successes: number;
  failures: number;
  totalTokens: number;
  totalCostUSD: number;
  averageLatency: number;
  byTask: Record<AIRouterTask, {
    count: number;
    successRate: number;
    averageTokens: number;
  }>;
  byModel: Record<string, {
    count: number;
    successRate: number;
    averageCost: number;
  }>;
}

// ============ OPENROUTER CLIENT ============

export class OpenRouterClient extends EventEmitter {
  private client: AxiosInstance;
  private apiKey: string;
  private rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
    remainingRequestsMinute: number;
    remainingRequestsDay: number;
    lastResetMinute: Date;
    lastResetDay: Date;
  };
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(config: AIProviderConfig) {
    super();

    if (!config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.apiKey = config.apiKey;

    this.client = axios.create({
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://prabu-siliwangi.com',
        'X-Title': 'Prabu-Siliwangi Trading AI',
      },
    });

    this.rateLimit = {
      requestsPerMinute: config.rateLimit?.requestsPerMinute || 60,
      requestsPerDay: config.rateLimit?.requestsPerDay || 1000,
      remainingRequestsMinute: config.rateLimit?.requestsPerMinute || 60,
      remainingRequestsDay: config.rateLimit?.requestsPerDay || 1000,
      lastResetMinute: new Date(),
      lastResetDay: new Date(),
    };

    // Start rate limit reset timers
    this.startRateLimitTimers();
  }

  private startRateLimitTimers(): void {
    // Reset minute counter every minute
    setInterval(() => {
      this.rateLimit.remainingRequestsMinute = this.rateLimit.requestsPerMinute;
      this.rateLimit.lastResetMinute = new Date();
      this.emit('rateLimitReset', { type: 'minute', timestamp: new Date() });
    }, 60000);

    // Reset day counter every day
    setInterval(() => {
      this.rateLimit.remainingRequestsDay = this.rateLimit.requestsPerDay;
      this.rateLimit.lastResetDay = new Date();
      this.emit('rateLimitReset', { type: 'day', timestamp: new Date() });
    }, 24 * 60 * 60 * 1000);
  }

  private async checkRateLimit(): Promise<void> {
    const now = new Date();

    // Check minute limit
    const minuteDiff = now.getTime() - this.rateLimit.lastResetMinute.getTime();
    if (minuteDiff >= 60000) {
      this.rateLimit.remainingRequestsMinute = this.rateLimit.requestsPerMinute;
      this.rateLimit.lastResetMinute = now;
    }

    // Check day limit
    const dayDiff = now.getTime() - this.rateLimit.lastResetDay.getTime();
    if (dayDiff >= 24 * 60 * 60 * 1000) {
      this.rateLimit.remainingRequestsDay = this.rateLimit.requestsPerDay;
      this.rateLimit.lastResetDay = now;
    }

    // Throw if limits exceeded
    if (this.rateLimit.remainingRequestsMinute <= 0) {
      throw new Error('Rate limit exceeded: Requests per minute');
    }

    if (this.rateLimit.remainingRequestsDay <= 0) {
      throw new Error('Rate limit exceeded: Requests per day');
    }
  }

  private updateRateLimit(): void {
    this.rateLimit.remainingRequestsMinute--;
    this.rateLimit.remainingRequestsDay--;
    this.emit('rateLimitUpdate', { ...this.rateLimit });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error('Error processing queued request:', error);
        }
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessingQueue = false;
  }

  public async chatCompletion(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Enqueue request for rate limiting
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await this.checkRateLimit();

          const model = options.model || 'openai/gpt-3.5-turbo';
          const response = await this.client.post('/chat/completions', {
            model,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 1000,
            stream: options.stream || false,
          });

          this.updateRateLimit();

          const completion = response.data;
          const latency = Date.now() - startTime;

          const aiResponse: AIResponse = {
            provider: 'openrouter',
            task: 'general', // Will be overridden by router
            model: completion.model,
            content: completion.choices[0]?.message?.content || '',
            usage: completion.usage ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
              costUSD: this.calculateCost(
                completion.model,
                completion.usage.prompt_tokens,
                completion.usage.completion_tokens
              ),
            } : undefined,
            latency,
          };

          this.emit('completionSuccess', aiResponse);
          resolve(aiResponse);

        } catch (error) {
          const axiosError = error as AxiosError;
          const latency = Date.now() - startTime;

          this.emit('completionError', {
            error: axiosError.message,
            status: axiosError.response?.status,
            latency,
          });

          reject(this.handleError(error));
        }
      });

      this.processQueue();
    });
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    // Simplified cost calculation based on OpenRouter pricing
    // In production, use actual pricing table
    const costPer1kInput = 0.0015; // $0.0015 per 1K tokens input
    const costPer1kOutput = 0.002; // $0.002 per 1K tokens output

    const inputCost = (promptTokens / 1000) * costPer1kInput;
    const outputCost = (completionTokens / 1000) * costPer1kOutput;

    return inputCost + outputCost;
  }

  private handleError(error: unknown): Error {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      switch (axiosError.response.status) {
        case 401:
          return new Error('Invalid API key');
        case 429:
          return new Error('Rate limit exceeded');
        case 500:
          return new Error('OpenRouter server error');
        case 503:
          return new Error('Service temporarily unavailable');
        default:
          return new Error(`API error: ${axiosError.response.status}`);
      }
    }

    if (axiosError.request) {
      return new Error('No response from OpenRouter API');
    }

    return new Error(`Request error: ${axiosError.message}`);
  }

  public getRateLimitStatus() {
    return { ...this.rateLimit };
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch {
      return false;
    }
  }
}

// ============ PROMPT TEMPLATE MANAGER ============

export class PromptTemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private defaultTemplates: PromptTemplate[];

  constructor() {
    this.defaultTemplates = this.createDefaultTemplates();
    this.loadDefaultTemplates();
  }

  private createDefaultTemplates(): PromptTemplate[] {
    return [
      {
        id: 'screening-basic',
        task: 'screening',
        template: `Analyze this Solana token for trading potential:

Token: {{tokenName}}
Symbol: {{tokenSymbol}}
Market Cap: {{marketCap}}
Volume (24h): {{volume24h}}
Liquidity: {{liquidity}}
Holder Count: {{holderCount}}

Please provide:
1. Risk assessment (Low/Medium/High)
2. Key strengths
3. Key risks
4. Trading recommendation (Avoid/Watch/Buy)`,
        variables: ['tokenName', 'tokenSymbol', 'marketCap', 'volume24h', 'liquidity', 'holderCount'],
        modelPreferences: ['openai/gpt-4', 'anthropic/claude-3-opus'],
        temperature: 0.3,
        maxTokens: 500,
      },
      {
        id: 'position-management',
        task: 'management',
        template: `Analyze this trading position:

Pair: {{pair}}
Entry Price: {{entryPrice}}
Current Price: {{currentPrice}}
PnL: {{pnl}} ({{pnlPercent}}%)
Position Size: {{positionSize}}
Risk Level: {{riskLevel}}

Market Conditions:
- Trend: {{trend}}
- Volatility: {{volatility}}
- Support: {{support}}
- Resistance: {{resistance}}

Provide management advice:
1. Should I hold, add, reduce, or exit?
2. Suggested stop loss
3. Suggested take profit
4. Risk management notes`,
        variables: ['pair', 'entryPrice', 'currentPrice', 'pnl', 'pnlPercent', 'positionSize', 'riskLevel', 'trend', 'volatility', 'support', 'resistance'],
        modelPreferences: ['openai/gpt-4', 'anthropic/claude-3-sonnet'],
        temperature: 0.2,
        maxTokens: 600,
      },
      {
        id: 'wallet-analysis',
        task: 'analysis',
        template: `Analyze this Solana wallet:

Wallet Address: {{walletAddress}}
Total Value: {{totalValue}}
Activity Level: {{activityLevel}}
Transaction Count: {{txCount}}
Age: {{ageDays}} days

Recent Activity:
{{recentTransactions}}

Provide analysis:
1. Wallet type (Trader/Investor/Scammer/etc.)
2. Risk assessment
3. Trading patterns
4. Recommendations`,
        variables: ['walletAddress', 'totalValue', 'activityLevel', 'txCount', 'ageDays', 'recentTransactions'],
        modelPreferences: ['openai/gpt-4', 'google/gemini-pro'],
        temperature: 0.4,
        maxTokens: 800,
      },
    ];
  }

  private loadDefaultTemplates(): void {
    this.defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  public registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  public getTemplate(id: string): PromptTemplate | null {
    return this.templates.get(id) || null;
  }

  public getTemplatesForTask(task: AIRouterTask): PromptTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.task === task);
  }

  public renderTemplate(id: string, variables: Record<string, string>): string {
    const template = this.getTemplate(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    let rendered = template.template;

    // Replace all variables
    template.variables.forEach(variable => {
      const value = variables[variable] || `{{${variable}}}`;
      rendered = rendered.replace(new RegExp(`{{${variable}}}`, 'g'), value);
    });

    // Remove any unreplaced variables
    rendered = rendered.replace(/\{\{.*?\}\}/g, 'N/A');

    return rendered;
  }

  public listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
}

// ============ MODEL REGISTRY ============

export class ModelRegistry {
  private models: Map<string, ModelInfo> = new Map();

  constructor() {
    this.registerDefaultModels();
  }

  private registerDefaultModels(): void {
    const defaultModels: ModelInfo[] = [
      {
        id: 'openai/gpt-4',
        provider: 'openrouter',
        contextLength: 8192,
        maxTokens: 4096,
        supportsFunctionCalling: true,
        costPer1kTokens: { input: 0.03, output: 0.06 },
        capabilities: ['analysis', 'screening', 'complex-reasoning'],
      },
      {
        id: 'openai/gpt-3.5-turbo',
        provider: 'openrouter',
        contextLength: 4096,
        maxTokens: 2048,
        supportsFunctionCalling: true,
        costPer1kTokens: { input: 0.0015, output: 0.002 },
        capabilities: ['general', 'simple-analysis', 'chat'],
      },
      {
        id: 'anthropic/claude-3-opus',
        provider: 'openrouter',
        contextLength: 200000,
        maxTokens: 4096,
        supportsFunctionCalling: false,
        costPer1kTokens: { input: 0.015, output: 0.075 },
        capabilities: ['complex-analysis', 'research', 'long-context'],
      },
      {
        id: 'anthropic/claude-3-sonnet',
        provider: 'openrouter',
        contextLength: 200000,
        maxTokens: 4096,
        supportsFunctionCalling: false,
        costPer1kTokens: { input: 0.003, output: 0.015 },
        capabilities: ['analysis', 'screening', 'balanced'],
      },
      {
        id: 'google/gemini-pro',
        provider: 'openrouter',
        contextLength: 32768,
        maxTokens: 2048,
        supportsFunctionCalling: false,
        costPer1kTokens: { input: 0.0005, output: 0.0015 },
        capabilities: ['general', 'creative', 'fast'],
      },
    ];

    defaultModels.forEach(model => {
      this.models.set(model.id, model);
    });
  }

  public registerModel(model: ModelInfo): void {
    this.models.set(model.id, model);
  }

  public getModel(id: string): ModelInfo | null {
    return this.models.get(id) || null;
  }

  public selectModelForTask(
    task: AIRouterTask,
    constraints?: {
      maxCost?: number;
      minContextLength?: number;
      requireFunctionCalling?: boolean;
    }
  ): ModelInfo | null {
    const suitableModels = Array.from(this.models.values())
      .filter(model => {
        // Check constraints
        if (constraints?.maxCost && model.costPer1kTokens.input > constraints.maxCost) {
          return false;
        }

        if (constraints?.minContextLength && model.contextLength < constraints.minContextLength) {
          return false;
        }

        if (constraints?.requireFunctionCalling && !model.supportsFunctionCalling) {
          return false;
        }

        // Task-specific suitability
        switch (task) {
          case 'screening':
            return model.capabilities.includes('screening') || model.capabilities.includes('analysis');
          case 'management':
            return model.capabilities.includes('analysis') || model.capabilities.includes('complex-reasoning');
          case 'analysis':
            return model.capabilities.includes('analysis') || model.capabilities.includes('complex-analysis');
          case 'recommendation':
            return model.capabilities.includes('analysis') || model.capabilities.includes('complex-reasoning');
          default:
            return true;
        }
      })
      .sort((a, b) => {
        // Sort by cost (cheapest first), then by context length
        const costA = a.costPer1kTokens.input;
        const costB = b.costPer1kTokens.input;

        if (costA !== costB) {
          return costA - costB;
        }

        return b.contextLength - a.contextLength;
      });

    return suitableModels[0] || null;
  }

  public listModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }
}

// ============ AI ROUTER ENGINE ============

export class AIRouterEngine extends EventEmitter {
  private openRouterClient: OpenRouterClient;
  private promptManager: PromptTemplateManager;
  private modelRegistry: ModelRegistry;
  private metrics: AIRouterMetrics;

  constructor(openRouterConfig: AIProviderConfig) {
    super();

    this.openRouterClient = new OpenRouterClient(openRouterConfig);
    this.promptManager = new PromptTemplateManager();
    this.modelRegistry = new ModelRegistry();

    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      totalTokens: 0,
      totalCostUSD: 0,
      averageLatency: 0,
      byTask: {} as Record<AIRouterTask, any>,
      byModel: {},
    };

    this.initializeMetrics();
    this.setupEventListeners();
  }

  private initializeMetrics(): void {
    // Initialize metrics for all tasks
    const tasks: AIRouterTask[] = ['screening', 'management', 'general', 'analysis', 'recommendation'];
    tasks.forEach(task => {
      this.metrics.byTask[task] = {
        count: 0,
        successRate: 0,
        averageTokens: 0,
      };
    });
  }

  private setupEventListeners(): void {
    this.openRouterClient.on('completionSuccess', (response: AIResponse) => {
      this.updateMetrics(response, true);
    });

    this.openRouterClient.on('completionError', (error: any) => {
      this.metrics.failures++;
      this.emit('metricsUpdate', this.metrics);
    });
  }

  private updateMetrics(response: AIResponse, success: boolean): void {
    this.metrics.requests++;

    if (success) {
      this.metrics.successes++;
      this.metrics.totalTokens += response.usage?.totalTokens || 0;
      this.metrics.totalCostUSD += response.usage?.costUSD || 0;

      // Update task-specific metrics
      const taskMetrics = this.metrics.byTask[response.task];
      taskMetrics.count++;
      taskMetrics.successRate = (taskMetrics.count / this.metrics.requests) * 100;
      taskMetrics.averageTokens =
        ((taskMetrics.averageTokens * (taskMetrics.count - 1)) + (response.usage?.totalTokens || 0)) / taskMetrics.count;

      // Update model-specific metrics
      const modelKey = response.model;
      if (!this.metrics.byModel[modelKey]) {
        this.metrics.byModel[modelKey] = {
          count: 0,
          successRate: 0,
          averageCost: 0,
        };
      }

      const modelMetrics = this.metrics.byModel[modelKey];
      modelMetrics.count++;
      modelMetrics.successRate = (modelMetrics.count / this.metrics.requests) * 100;
      modelMetrics.averageCost =
        ((modelMetrics.averageCost * (modelMetrics.count - 1)) + (response.usage?.costUSD || 0)) / modelMetrics.count;

      // Update average latency
      this.metrics.averageLatency =
        ((this.metrics.averageLatency * (this.metrics.successes - 1)) + response.latency) / this.metrics.successes;
    } else {
      this.metrics.failures++;
    }

    this.emit('metricsUpdate', this.metrics);
  }

  public async routeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Select appropriate model
      const modelInfo = this.modelRegistry.selectModelForTask(request.task, {
        maxCost: 0.01, // Max $0.01 per request
        minContextLength: 4096,
      });

      const model = request.model || modelInfo?.id || 'openai/gpt-3.5-turbo';

      // Get or create prompt
      let prompt = request.prompt;

      // Try to find a template for this task
      const templates = this.promptManager.getTemplatesForTask(request.task);
      if (templates.length > 0 && request.metadata) {
        // Use the first template and render with metadata
        const template = templates[0];
        prompt = this.promptManager.renderTemplate(template.id, request.metadata as Record<string, string>);
      }

      // Prepare messages
      const messages = [
        {
          role: 'system' as const,
          content: this.getSystemPrompt(request.task),
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      // Make API call
      const response = await this.openRouterClient.chatCompletion(messages, {
        model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      });

      // Add task to response
      response.task = request.task;

      this.emit('requestCompleted', {
        request,
        response,
        latency: Date.now() - startTime,
      });

      return response;

    } catch (error) {
      const latency = Date.now() - startTime;

      this.emit('requestFailed', {
        request,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency,
      });

      throw error;
    }
  }

  private getSystemPrompt(task: AIRouterTask): string {
    const basePrompt = `You are Prabu-Siliwangi AI, a specialized trading assistant for Solana blockchain.
You provide concise, actionable insights for crypto trading.`;

    const taskPrompts: Record<AIRouterTask, string> = {
      screening: `${basePrompt}
You are analyzing tokens for trading potential. Focus on:
- Risk assessment
- Market dynamics
- Technical indicators
- Trading recommendations
Be objective and data-driven.`,

      management: `${basePrompt}
You are managing trading positions. Focus on:
- Risk management
- Position sizing
- Exit strategies
- Market conditions
Provide clear action items.`,

      analysis: `${basePrompt}
You are analyzing wallets and market data. Focus on:
- Pattern recognition
- Anomaly detection
- Trend analysis
- Predictive insights
Support conclusions with data.`,

      recommendation: `${basePrompt}
You are providing trading recommendations. Focus on:
- Opportunity identification
- Risk/reward analysis
- Entry/exit points
- Portfolio impact
Be specific and timely.`,

      general: `${basePrompt}
You are a general trading assistant. Be helpful, accurate, and concise.`,
    };

    return taskPrompts[task];
  }

  public getPromptManager(): PromptTemplateManager {
    return this.promptManager;
  }

  public getModelRegistry(): ModelRegistry {
    return this.modelRegistry;
  }

  public getMetrics(): AIRouterMetrics {
    return { ...this.metrics };
  }

  public async healthCheck(): Promise<{
    openrouter: boolean;
    overall: boolean;
  }> {
    const openrouterHealthy = await this.openRouterClient.healthCheck();

    return {
      openrouter: openrouterHealthy,
      overall: openrouterHealthy,
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.openRouterClient);
  }

  public getConfigSummary(): {
    models: number;
    templates: number;
    metrics: AIRouterMetrics;
  } {
    return {
      models: this.modelRegistry.listModels().length,
      templates: this.promptManager.listTemplates().length,
      metrics: this.getMetrics(),
    };
  }
}

// ============ FACTORY FUNCTIONS ============

export function createOpenRouterClient(config: AIProviderConfig): OpenRouterClient {
  return new OpenRouterClient(config);
}

export function createPromptTemplateManager(): PromptTemplateManager {
  return new PromptTemplateManager();
}

export function createModelRegistry(): ModelRegistry {
  return new ModelRegistry();
}

export function createAIRouterEngine(openRouterConfig: AIProviderConfig): AIRouterEngine {
  return new AIRouterEngine(openRouterConfig);
}

// ============ MODULE DESCRIPTION ============

export interface AIRouterModuleSummary {
  name: string;
  purpose: string;
  ready: boolean;
  features: string[];
  version: string;
}

export function describeAIRouter(): AIRouterModuleSummary {
  return {
    name: '@prabu/ai-router',
    purpose: 'AI routing system for Prabu-Siliwangi with OpenRouter integration, task-based routing, and prompt engineering',
    ready: true,
    features: [
      'OpenRouter API integration with rate limiting',
      'Task-based model selection',
      'Prompt template management',
      'Cost optimization',
      'Comprehensive metrics and monitoring',
      'Health checks and error handling',
    ],
    version: '1.0.0',
  };
}

// ============ UTILITY FUNCTIONS ============

/**
 * Extract structured data from AI response
 */
export function extractStructuredData<T>(
  response: AIResponse,
  schema: Record<string, string>
): Partial<T> {
  try {
    const content = response.content;
    const result: Record<string, any> = {};

    // Simple extraction - in production use more sophisticated parsing
    for (const [key, description] of Object.entries(schema)) {
      const regex = new RegExp(`${key}:\\s*([^\\n]+)`, 'i');
      const match = content.match(regex);

      if (match) {
        result[key] = match[1].trim();
      }
    }

    return result as Partial<T>;
  } catch (error) {
    console.error('Error extracting structured data:', error);
    return {};
  }
}

/**
 * Validate AI request
 */
export function validateAIRequest(request: AIRequest): string[] {
  const errors: string[] = [];

  if (!request.task) {
    errors.push('Task is required');
  }

  if (!request.prompt || request.prompt.trim().length === 0) {
    errors.push('Prompt is required');
  }

  if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }

  if (request.maxTokens !== undefined && request.maxTokens < 1) {
    errors.push('Max tokens must be positive');
  }

  return errors;
}

/**
 * Format AI response for display
 */
export function formatAIResponse(response: AIResponse): string {
  return `
🤖 AI Response (${response.provider}/${response.model})
────────────────────
${response.content}
────────────────────
📊 Stats: ${response.usage?.totalTokens || 'N/A'} tokens | ⏱️ ${response.latency}ms
💰 Cost: $${response.usage?.costUSD?.toFixed(4) || 'N/A'}
`.trim();
}

// ============ DEFAULT EXPORTS ============

export default AIRouterEngine;
