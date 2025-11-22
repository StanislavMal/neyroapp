// 📄 src/services/supabase.ts

import { supabase } from '../utils/supabase';
import { retryAsync } from '../utils/retry';
import type { UserSettings } from '../store';
import type { Message } from '../lib/ai/types';

/**
 * =================================================================
 * СЕРВИСНЫЙ СЛОЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С SUPABASE
 * =================================================================
 */

// --- Settings (Profiles) ---
// ... (код без изменений) ...
export function fetchSettings(userId: string) {
  return retryAsync(() => 
    supabase.from('profiles').select('settings').eq('id', userId).single()
  );
}

export function updateSettings(userId: string, settings: UserSettings) {
  return retryAsync(() => 
    supabase.from('profiles').update({ settings }).eq('id', userId)
  );
}

// --- Prompts ---
// ... (код без изменений) ...
export function fetchPrompts(userId: string) {
  return retryAsync(() => 
    supabase.from('prompts').select('*').eq('user_id', userId).order('created_at')
  );
}

export function createPrompt(userId: string, name: string, content: string) {
  return retryAsync(() => 
    supabase.from('prompts').insert({ name, content, user_id: userId })
  );
}

export function updatePrompt(userId: string, id: string, name: string, content: string) {
  return retryAsync(() => 
    supabase.from('prompts').update({ name, content }).eq('id', id).eq('user_id', userId)
  );
}

export function deletePrompt(id: string) {
  return retryAsync(() => 
    supabase.from('prompts').delete().eq('id', id)
  );
}

export async function setPromptActive(userId: string, id: string, isActive: boolean) {
  await retryAsync(() => 
    supabase.from('prompts').update({ is_active: false }).eq('user_id', userId)
  );
  if (isActive) {
    await retryAsync(() => 
      supabase.from('prompts').update({ is_active: true }).eq('id', id)
    );
  }
}

// --- Conversations ---
// ... (код без изменений) ...
export function fetchConversations(userId: string) {
  return retryAsync(() => 
    supabase.from('conversations').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  );
}

export function createConversation(userId: string, title: string) {
  return retryAsync(() => 
    supabase.from('conversations').insert({ title, user_id: userId }).select().single()
  );
}

export function updateConversationTitle(id: string, title: string) {
  return retryAsync(() => 
    supabase.from('conversations').update({ title }).eq('id', id)
  );
}

export function deleteConversation(id: string) {
  return retryAsync(() => 
    supabase.from('conversations').delete().eq('id', id)
  );
}

// --- Messages ---
// ... (код без изменений) ...
export function fetchMessages(conversationId: string) {
  return retryAsync(() => 
    supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }).order('id', { ascending: true })
  );
}

export function createMessage(userId: string, conversationId: string, message: Message) {
  return retryAsync(() => 
    supabase.from('messages').insert({
      id: message.id,
      conversation_id: conversationId,
      user_id: userId,
      role: message.role,
      content: message.content,
      attachments: message.attachments,
    })
  );
}

export function updateMessageContent(id: string, content: string) {
  return retryAsync(() => 
    supabase.from('messages').update({ content }).eq('id', id)
  );
}

export function deleteMessages(ids: string[]) {
  return retryAsync(() => 
    supabase.from('messages').delete().in('id', ids)
  );
}

export function duplicateMessages(newConversationId: string, messagesToCopy: any[]) {
  const newMessages = messagesToCopy.map((msg: any) => {
    const { id, ...restOfMsg } = msg;
    return {
      ...restOfMsg,
      conversation_id: newConversationId,
    };
  });
  return retryAsync(() => 
    supabase.from('messages').insert(newMessages)
  );
}

// --- Attachments (Storage) ---

/**
 * Загружает файл в Supabase Storage.
 * @param userId ID пользователя, для создания пути
 * @param file Файл для загрузки
 * @returns Путь к файлу в Storage
 */
export async function uploadAttachment(userId: string, file: File): Promise<string> {
  // ✅ ИСПРАВЛЕНИЕ: Добавлена проверка на наличие имени файла
  if (!file.name) {
    throw new Error('File has no name.');
  }
  
  const fileExt = file.name.split('.').pop() || 'bin'; // Добавляем fallback расширение
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error } = await retryAsync(() => 
    supabase.storage
      .from('message_attachments')
      .upload(filePath, file)
  );

  if (error) {
    console.error("Ошибка загрузки файла:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return filePath;
}

/**
 * Создает подписанные (временные) URL для массива путей к файлам.
 * @param paths Массив путей к файлам в Storage
 * @returns Массив объектов с путем и подписанным URL
 */
export async function createSignedUrls(paths: string[]): Promise<{ path: string; signedUrl: string }[]> {
  const { data, error } = await retryAsync(() => 
    supabase.storage
      .from('message_attachments')
      .createSignedUrls(paths, 3600) // URL действителен 1 час
  );

  if (error) {
    console.error("Ошибка создания подписанных URL:", error);
    return [];
  }

  return data.map(item => ({
    path: item.path,
    signedUrl: item.signedUrl,
  })).filter((item): item is { path: string; signedUrl: string } => !!item.signedUrl);
}