// 📄 src/services/supabase.ts

import { supabase } from '../utils/supabase';
import { retryAsync } from '../utils/retry';
// ✅ ИЗМЕНЕНИЕ: Удалены неиспользуемые типы Postgrest...
import type { UserSettings } from '../store'; // ✅ ИЗМЕНЕНИЕ: Удалены неиспользуемые Prompt, Conversation
import type { Message } from '../lib/ai/types';

/**
 * =================================================================
 * СЕРВИСНЫЙ СЛОЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С SUPABASE
 * =================================================================
 * Вся логика запросов к базе данных инкапсулирована здесь.
 * Хуки в store/hooks.ts вызывают эти функции, но не содержат
 * логики самих запросов.
 * =================================================================
 */

// --- Settings (Profiles) ---

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
      content: message.content
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
  const newMessages = messagesToCopy.map((msg: any) => ({
    ...msg,
    conversation_id: newConversationId,
  }));
  return retryAsync(() => 
    supabase.from('messages').insert(newMessages)
  );
}
