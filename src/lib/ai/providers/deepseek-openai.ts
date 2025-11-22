import type { AIModel } from '../types';
import { BaseOpenAIProvider } from './base-openai-provider';

export class DeepSeekOpenAIProvider extends BaseOpenAIProvider {
  name = 'DeepSeek (OpenAI Compatible)';
  protected readonly baseURL = 'https://api.deepseek.com';

  constructor() {  
    super('DEEPSEEK_API_KEY_', 'DeepSeek');
  }

  // Для DeepSeek не требуется переопределять buildRequestOptions,
  // так как он использует стандартный набор параметров.

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