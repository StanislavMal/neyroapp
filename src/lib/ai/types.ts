// 📄 src/lib/ai/types.ts

// Определяем тип для вложений, который будет храниться в нашей БД
export interface Attachment {
  type: 'image'; // В будущем можно добавить 'video', 'audio' и т.д.
  url: string;   // URL для отображения в UI (будет подписанным URL)
  path: string;  // Путь к файлу в Supabase Storage
}

// Определяем тип для сложного контента, который отправляется в AI
export type MessageContent = string | Array<{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string; // URL, доступный для AI (должен быть публичным или pre-signed)
  };
}>;

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // В UI здесь всегда будет текст
  attachments?: Attachment[]; // А здесь - вложения
}

export interface AIModel {
  id: string;
  name: string;
  provider: 'gemini' | 'deepseek' | 'openai' | 'anthropic';
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsFunctions?: boolean;
  supportsVision?: boolean;
  supportsAudio?: boolean;
  reasoning?: {
    supported: boolean;
    levels?: string[];
  };
}

export interface AIProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface StreamChunk {
  text?: string;
  error?: string;
  finished?: boolean;
}

export interface AIProvider {
  name: string;
  streamChat(messages: { role: 'user' | 'assistant' | 'system', content: MessageContent }[], config: Partial<AIProviderConfig>): Promise<ReadableStream<Uint8Array>>;
  getAvailableModels(): AIModel[];
}