// 📄 src/lib/ai/providers/base-openai-provider.ts

import OpenAI from 'openai';
import type { AIProvider, Message, AIModel, AIProviderConfig, StreamChunk } from '../types';

// Интерфейс для отслеживания состояния каждого API-ключа
interface KeyStatus {
  key: string;
  failureCount: number;
  lastFailure: number | null;
  isDisabled: boolean;
}

/**
 * Абстрактный базовый класс для AI-провайдеров, совместимых с OpenAI API.
 * Инкапсулирует логику ротации API-ключей и обработки ошибок.
 */
export abstract class BaseOpenAIProvider implements AIProvider {
  abstract name: string;
  abstract getAvailableModels(): AIModel[];
  protected abstract readonly baseURL: string;
  protected readonly providerName: string; // ✅ ИЗМЕНЕНИЕ: Убрали abstract

  private keys: KeyStatus[];
  private currentKeyIndex = 0;
  
  private readonly MAX_FAILURES = 3; // Макс. ошибок до временной блокировки ключа
  private readonly DISABLE_DURATION = 5 * 60 * 1000; // 5 минут

  constructor(apiKeyPrefix: string, providerName: string) {
    this.providerName = providerName;

    // Находим все ключи в переменных окружения по префиксу (напр. 'GEMINI_API_KEY_')
    const apiKeys = Object.keys(process.env)
      .filter(key => key.startsWith(apiKeyPrefix) && process.env[key])
      .map(key => process.env[key] as string);
    
    if (apiKeys.length === 0) {
      throw new Error(`Не найдены переменные окружения с префиксом ${apiKeyPrefix}`);
    }

    this.keys = apiKeys.map(key => ({
      key,
      failureCount: 0,
      lastFailure: null,
      isDisabled: false,
    }));

    console.log(`[${this.providerName}Provider] Инициализирован с ${this.keys.length} API-ключами`);
  }

  /**
   * Получает следующий доступный API-ключ из пула.
   */
  private getNextApiKey(): string {
    const now = Date.now();
    
    // Проверяем, не пора ли снова включить заблокированные ключи
    this.keys.forEach(keyStatus => {
      if (keyStatus.isDisabled && keyStatus.lastFailure) {
        if (now - keyStatus.lastFailure > this.DISABLE_DURATION) {
          console.log(`[${this.providerName}Provider] Повторно включаю ключ после паузы`);
          keyStatus.isDisabled = false;
          keyStatus.failureCount = 0;
          keyStatus.lastFailure = null;
        }
      }
    });

    const activeKeys = this.keys.filter(k => !k.isDisabled);
    
    // Если все ключи заблокированы, принудительно активируем самый старый
    if (activeKeys.length === 0) {
      const oldestDisabled = this.keys.reduce((oldest, current) => {
        if (!current.lastFailure) return oldest;
        if (!oldest.lastFailure) return current;
        return current.lastFailure < oldest.lastFailure ? current : oldest;
      });
      
      console.warn(`[${this.providerName}Provider] Все ключи заблокированы, принудительно активирую самый старый`);
      oldestDisabled.isDisabled = false;
      oldestDisabled.failureCount = 0;
      oldestDisabled.lastFailure = null;
      
      return oldestDisabled.key;
    }

    // Ищем следующий активный ключ
    let attempts = 0;
    while (attempts < this.keys.length) {
      const keyStatus = this.keys[this.currentKeyIndex];
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      
      if (!keyStatus.isDisabled) {
        return keyStatus.key;
      }
      
      attempts++;
    }

    // Fallback на случай, если что-то пошло не так
    return this.keys[0].key;
  }

  /**
   * Помечает ключ как сбойный, увеличивая счетчик ошибок.
   */
  private markKeyAsFailed(apiKey: string, error: Error): void {
    const keyStatus = this.keys.find(k => k.key === apiKey);
    if (!keyStatus) return;

    const errorMessage = error.message.toLowerCase();
    
    // Блокируем ключ только при ошибках, связанных с лимитами или квотой
    const isRateLimitError = 
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('resource exhausted');

    if (isRateLimitError) {
      keyStatus.failureCount++;
      keyStatus.lastFailure = Date.now();
      
      console.warn(
        `[${this.providerName}Provider] Ошибка ключа ${keyStatus.failureCount}/${this.MAX_FAILURES}`,
        { error: error.message }
      );

      if (keyStatus.failureCount >= this.MAX_FAILURES) {
        keyStatus.isDisabled = true;
        console.error(
          `[${this.providerName}Provider] Ключ заблокирован из-за повторных ошибок. ` +
          `Повторная попытка через ${this.DISABLE_DURATION / 1000}с`
        );
      }
    }
  }

  /**
   * Сбрасывает счетчик ошибок для ключа после успешного запроса.
   */
  private markKeyAsSuccess(apiKey: string): void {
    const keyStatus = this.keys.find(k => k.key === apiKey);
    if (!keyStatus) return;

    if (keyStatus.failureCount > 0) {
      console.log(`[${this.providerName}Provider] Ключ восстановлен, сбрасываю счетчик ошибок`);
      keyStatus.failureCount = 0;
      keyStatus.lastFailure = null;
    }
  }

  /**
   * Метод-хук для сборки параметров запроса. Может быть переопределен в дочерних классах.
   */
  protected buildRequestOptions(messages: Message[], config: Partial<AIProviderConfig>): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
    const openAIMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    return {
      model: config.model || this.getAvailableModels()[0].id,
      messages: openAIMessages,
      stream: true,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens,
    };
  }

  /**
   * Основной метод для стриминга ответа от AI.
   */
  async streamChat(messages: Message[], config: Partial<AIProviderConfig>): Promise<ReadableStream<Uint8Array>> {
    const apiKey = this.getNextApiKey();
    
    const openai = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
    });
    
    const requestOptions = this.buildRequestOptions(messages, config);
    const providerNameForStream = this.providerName;

    try {
      console.log(`[${this.providerName}Provider] Использую модель: ${requestOptions.model}`);
      const response = await openai.chat.completions.create(requestOptions);

      this.markKeyAsSuccess(apiKey);

      return new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          
          try {
            for await (const chunk of response) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                const streamChunk: StreamChunk = { text: content };
                controller.enqueue(encoder.encode(JSON.stringify(streamChunk) + '\n'));
              }
            }
            const finalChunk: StreamChunk = { finished: true };
            controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + '\n'));
          } catch (error) {
            console.error(`[${providerNameForStream}Provider] Ошибка в обработке стрима:`, error);
            const errorChunk: StreamChunk = { 
              error: error instanceof Error ? error.message : 'Произошла неизвестная ошибка' 
            };
            controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n'));
          } finally {
            controller.close();
          }
        },
      });
    } catch (error) {
      console.error(`[${this.providerName}Provider] Ошибка в streamChat:`, error);
      
      if (error instanceof Error) {
        this.markKeyAsFailed(apiKey, error);
        throw new Error(`${this.providerName} API Error: ${error.message}`);
      }
      throw error;
    }
  }
}