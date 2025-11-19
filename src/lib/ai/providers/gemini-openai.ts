// 📄 src/lib/ai/providers/gemini-openai.ts

import type OpenAI from 'openai';
import type { AIModel, AIProviderConfig, Message } from '../types';
import { BaseOpenAIProvider } from './base-openai-provider';

export class GeminiOpenAIProvider extends BaseOpenAIProvider {
  name = 'Gemini (OpenAI Compatible)';
  protected readonly baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  
  constructor() {
    super('GEMINI_API_KEY_', 'Gemini');
  }

  /**
   * Переопределяем метод для добавления специфичных для Gemini параметров,
   * таких как 'reasoning_effort'.
   */
  protected override buildRequestOptions(messages: Message[], config: Partial<AIProviderConfig>): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
    // Получаем базовые опции от родительского класса
    const requestOptions = super.buildRequestOptions(messages, config);

    // Логика, специфичная для Gemini 2.5
    if (config.model?.includes('2.5')) {
      if (config.reasoningEffort && config.reasoningEffort !== 'none') {
        (requestOptions as any).reasoning_effort = config.reasoningEffort;
      }
      
      // Gemini 2.5 Pro требует 'reasoning_effort'
      if (config.model === 'gemini-2.5-pro' && (!config.reasoningEffort || config.reasoningEffort === 'none')) {
        (requestOptions as any).reasoning_effort = 'low';
      }
    }
    
    return requestOptions;
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        description: 'Latest Flash model with reasoning capabilities',
        contextWindow: 1000000,
        maxOutputTokens: 16384,
        supportsFunctions: true,
        supportsVision: true,
        supportsAudio: true,
        reasoning: {
          supported: true,
          levels: ['low', 'medium', 'high'],
        },
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'gemini',
        description: 'Most capable model with advanced reasoning',
        contextWindow: 2000000,
        maxOutputTokens: 65536,
        supportsFunctions: true,
        supportsVision: true,
        supportsAudio: true,
        reasoning: {
          supported: true,
          levels: ['low', 'medium', 'high'],
        },
      },
    ];
  }
}