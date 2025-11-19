// 📄 src/hooks/useSupabaseSubscriptions.ts

import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { actions, store } from '../store/store';
import type { Conversation, UserSettings, Prompt } from '../store';
import type { Message } from '../lib/ai/types';
import type { User } from '@supabase/supabase-js';

type MessageWithConversationId = Message & { conversation_id: string };
type ProfilePayload = { id: string; settings: UserSettings | null };

interface UseSupabaseSubscriptionsProps {
  user: User | null;
  loadConversations: () => Promise<void>;
  loadPrompts: () => Promise<void>;
}

export function useSupabaseSubscriptions({
  user,
  loadConversations,
  loadPrompts,
}: UseSupabaseSubscriptionsProps) {
  useEffect(() => {
    if (!user) return;

    const channels = [
      // Канал для отслеживания изменений в беседах
      supabase.channel('conversations-changes').on<Conversation>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${user.id}` },
        () => {
          console.log('[Supabase] Беседы изменились, перезагружаю.');
          loadConversations();
        }
      ).subscribe(),

      // Канал для отслеживания новых сообщений
      supabase.channel('messages-changes').on<MessageWithConversationId>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          // Добавляем в кэш, только если это сообщение для текущей беседы
          if (store.state.currentConversationId === payload.new.conversation_id) {
            console.log('[Supabase] Получено новое сообщение для текущей беседы.');
            actions.addMessageToCache(payload.new.conversation_id, payload.new as Message);
          }
        }
      ).subscribe(),

      // Канал для отслеживания изменений профиля/настроек
      supabase.channel('profiles-changes').on<ProfilePayload>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          if (payload.new.settings) {
            console.log('[Supabase] Настройки обновлены.');
            actions.setSettings(payload.new.settings);
          }
        }
      ).subscribe(),

      // Канал для отслеживания изменений промптов
      supabase.channel('prompts-changes').on<Prompt>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prompts', filter: `user_id=eq.${user.id}` },
        () => {
          console.log('[Supabase] Промпты изменились, перезагружаю.');
          loadPrompts();
        }
      ).subscribe()
    ];

    // Функция очистки для отписки от всех каналов
    return () => {
      console.log('[Supabase] Отписка от всех каналов.');
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [user, loadPrompts, loadConversations]);
}