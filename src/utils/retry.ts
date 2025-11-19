// 📄 src/utils/retry.ts

/**
 * Утилита для повторных попыток асинхронных операций с экспоненциальной задержкой
 */

interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  onRetry: () => {},
};

// ✅ ИЗМЕНЕНИЕ: Сигнатура теперь принимает PromiseLike и корректно выводит тип
export async function retryAsync<T>(
  fn: () => PromiseLike<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // ✅ ИЗМЕНЕНИЕ: Мы используем await, который работает и с Promise, и с PromiseLike
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Не повторяем при определённых ошибках
      if (isNonRetryableError(lastError)) {
        throw lastError;
      }
      
      if (attempt < opts.maxAttempts) {
        const delay = Math.min(
          opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
          opts.maxDelay
        );
        
        opts.onRetry(attempt, lastError);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Проверяет, является ли ошибка неповторяемой (например, ошибка валидации)
 */
function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Ошибки аутентификации и авторизации не повторяем
  if (message.includes('jwt') || message.includes('unauthorized') || message.includes('forbidden')) {
    return true;
  }
  
  // Ошибки валидации данных не повторяем
  if (message.includes('duplicate') || message.includes('unique constraint') || message.includes('foreign key')) {
    return true;
  }
  
  return false;
}