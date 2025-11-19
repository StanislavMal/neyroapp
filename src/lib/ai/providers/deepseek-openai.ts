// 📄 src/lib/ai/providers/deepseek-openai.ts

import OpenAI from 'openai';
import type { AIProvider, Message, AIModel, AIProviderConfig, StreamChunk } from '../types';

interface KeyStatus {
  key: string;
  failureCount: number;
  lastFailure: number | null;
  isDisabled: boolean;
}

export class DeepSeekOpenAIProvider implements AIProvider {
  name = 'DeepSeek (OpenAI Compatible)';
  
  private keys: KeyStatus[];
  private currentKeyIndex = 0;
  
  private readonly MAX_FAILURES = 3;
  private readonly DISABLE_DURATION = 5 * 60 * 1000; // 5 минут

  constructor() {
    const apiKeys = Object.keys(process.env)
      .filter(key => key.startsWith('DEEPSEEK_API_KEY_') && process.env[key])
      .map(key => process.env[key] as string);
    
    if (apiKeys.length === 0) {
      throw new Error('No DEEPSEEK_API_KEY_* environment variables found');
    }

    this.keys = apiKeys.map(key => ({
      key,
      failureCount: 0,
      lastFailure: null,
      isDisabled: false,
    }));

    console.log(`[DeepSeekProvider] Initialized with ${this.keys.length} API keys`);
  }

  private getNextApiKey(): string {
    const now = Date.now();
    
    this.keys.forEach(keyStatus => {
      if (keyStatus.isDisabled && keyStatus.lastFailure) {
        if (now - keyStatus.lastFailure > this.DISABLE_DURATION) {
          console.log(`[DeepSeekProvider] Re-enabling key after cooldown`);
          keyStatus.isDisabled = false;
          keyStatus.failureCount = 0;
          keyStatus.lastFailure = null;
        }
      }
    });

    const activeKeys = this.keys.filter(k => !k.isDisabled);
    
    if (activeKeys.length === 0) {
      const oldestDisabled = this.keys.reduce((oldest, current) => {
        if (!current.lastFailure) return oldest;
        if (!oldest.lastFailure) return current;
        return current.lastFailure < oldest.lastFailure ? current : oldest;
      });
      
      console.warn('[DeepSeekProvider] All keys disabled, force-enabling oldest');
      oldestDisabled.isDisabled = false;
      oldestDisabled.failureCount = 0;
      oldestDisabled.lastFailure = null;
      
      return oldestDisabled.key;
    }

    let attempts = 0;
    while (attempts < this.keys.length) {
      const keyStatus = this.keys[this.currentKeyIndex];
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      
      if (!keyStatus.isDisabled) {
        return keyStatus.key;
      }
      
      attempts++;
    }

    return this.keys[0].key;
  }

  private markKeyAsFailed(apiKey: string, error: Error): void {
    const keyStatus = this.keys.find(k => k.key === apiKey);
    if (!keyStatus) return;

    const errorMessage = error.message.toLowerCase();
    
    const isRateLimitError = 
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('resource exhausted');

    if (isRateLimitError) {
      keyStatus.failureCount++;
      keyStatus.lastFailure = Date.now();
      
      console.warn(
        `[DeepSeekProvider] Key failure ${keyStatus.failureCount}/${this.MAX_FAILURES}`,
        { error: error.message }
      );

      if (keyStatus.failureCount >= this.MAX_FAILURES) {
        keyStatus.isDisabled = true;
        console.error(
          `[DeepSeekProvider] Key disabled due to repeated failures. ` +
          `Will retry in ${this.DISABLE_DURATION / 1000}s`
        );
      }
    }
  }

  private markKeyAsSuccess(apiKey: string): void {
    const keyStatus = this.keys.find(k => k.key === apiKey);
    if (!keyStatus) return;

    if (keyStatus.failureCount > 0) {
      console.log(`[DeepSeekProvider] Key recovered, resetting failure count`);
      keyStatus.failureCount = 0;
      keyStatus.lastFailure = null;
    }
  }

  async streamChat(messages: Message[], config: Partial<AIProviderConfig>): Promise<ReadableStream<Uint8Array>> {
    const apiKey = this.getNextApiKey();
    
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
    
    const openAIMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    const requestOptions: any = {
      model: config.model || 'deepseek-chat',
      messages: openAIMessages,
      stream: true,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens,
    };

    try {
      console.log(`[DeepSeekProvider] Using model: ${requestOptions.model}`);
      const response = await openai.chat.completions.create(requestOptions);

      this.markKeyAsSuccess(apiKey);

      return new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          
          try {
            if (Symbol.asyncIterator in response) {
              for await (const chunk of response as AsyncIterable<any>) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                  const streamChunk: StreamChunk = { text: content };
                  controller.enqueue(encoder.encode(JSON.stringify(streamChunk) + '\n'));
                }
              }
            } else {
              const stream = response as any;
              for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                  const streamChunk: StreamChunk = { text: content };
                  controller.enqueue(encoder.encode(JSON.stringify(streamChunk) + '\n'));
                }
              }
            }
            
            const finalChunk: StreamChunk = { finished: true };
            controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + '\n'));
          } catch (error) {
            console.error('[DeepSeekProvider] Error in stream processing:', error);
            const errorChunk: StreamChunk = { 
              error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
            controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n'));
          } finally {
            controller.close();
          }
        },
      });
    } catch (error) {
      console.error('[DeepSeekProvider] Error in streamChat:', error);
      
      if (error instanceof Error) {
        this.markKeyAsFailed(apiKey, error);
      }
      
      if (error instanceof Error) {
        throw new Error(`DeepSeek API Error: ${error.message}`);
      }
      throw error;
    }
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        description: 'DeepSeek V3 - Advanced reasoning and coding capabilities',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsFunctions: true,
        supportsVision: false,
        supportsAudio: false,
        reasoning: {
          supported: false,
        },
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        provider: 'deepseek',
        description: 'DeepSeek R1 - Enhanced reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 64000,
        supportsFunctions: true,
        supportsVision: false,
        supportsAudio: false,
        reasoning: {
          supported: true,
          levels: ['auto'],
        },
      },
    ];
  }
}