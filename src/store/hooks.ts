// 📄 src/store/hooks.ts

import { useCallback } from 'react';
import { useStore } from '@tanstack/react-store';
import { actions, selectors, store, type Conversation, type Prompt, type UserSettings } from './store';
import type { Message, Attachment } from '../lib/ai/types';
import { useAuth } from '../providers/AuthProvider';
import * as api from '../services/supabase';

const loadMessagesForConversation = async (conversationId: string) => {
  if (store.state.messageCache[conversationId]) {
    console.log(`[loadMessages] Сообщения для ${conversationId} найдены в кэше. Пропускаю загрузку.`);
    return;
  }

  console.log('[loadMessages] Загрузка сообщений для беседы:', conversationId);
  try {
    const { data, error } = await api.fetchMessages(conversationId);
    
    if (error) throw error;

    let messages = data.map((m: any) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      attachments: m.attachments as Attachment[] | undefined,
    })) as Message[];

    const attachmentPaths = messages
      .flatMap(m => m.attachments || [])
      .map(att => att.path)
      .filter(Boolean);

    if (attachmentPaths.length > 0) {
      const signedUrls = await api.createSignedUrls(attachmentPaths);
      const urlMap = new Map(signedUrls.map(item => [item.path, item.signedUrl]));

      messages = messages.map(m => {
        if (!m.attachments) return m;
        return {
          ...m,
          attachments: m.attachments.map(att => ({
            ...att,
            url: urlMap.get(att.path) || att.url,
          })),
        };
      });
    }
    
    console.log('[loadMessages] Загружено сообщений:', messages.length);
    actions.setCachedMessages(conversationId, messages);

  } catch (error) {
    console.error('Не удалось загрузить сообщения после всех попыток:', error);
    actions.setCachedMessages(conversationId, []);
  }
};

// ... (хуки useSettings, usePrompts, useAppState без изменений) ...

export function useSettings() {
    const { user } = useAuth();
    const settings = useStore(store, s => selectors.getSettings(s));

    const loadSettings = useCallback(async () => {
      if (!user) return;
      
      try {
        const { data, error } = await api.fetchSettings(user.id);
        
        if (error) {
          console.error("Ошибка загрузки настроек:", error);
          return;
        }
        
        if (data && data.settings) {
            const loadedSettings = data.settings;
            const settingsWithDefaults: UserSettings = {
                model: loadedSettings.model || 'gemini-2.5-flash',
                provider: loadedSettings.provider || 'gemini',
                system_instruction: loadedSettings.system_instruction || '',
                temperature: loadedSettings.temperature ?? 0.7,
                maxTokens: loadedSettings.maxTokens || 8192,
                reasoningEffort: loadedSettings.reasoningEffort || 'none',
                streamSpeed: loadedSettings.streamSpeed || 30,
            };
            actions.setSettings(settingsWithDefaults);
        } else {
            const defaultSettings: UserSettings = {
                model: 'gemini-2.5-flash',
                provider: 'gemini',
                system_instruction: '',
                temperature: 0.7,
                maxTokens: 8192,
                reasoningEffort: 'none',
                streamSpeed: 30,
            };
            actions.setSettings(defaultSettings);
            await api.updateSettings(user.id, defaultSettings);
        }
      } catch (error) {
        console.error("Не удалось загрузить настройки после всех попыток:", error);
      }
    }, [user]);

    const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
        if (!user || !settings) return;
        const updated = { ...settings, ...newSettings };
        actions.setSettings(updated);
        
        try {
          const { error } = await api.updateSettings(user.id, updated);
          if (error) {
              console.error("Ошибка обновления настроек:", error);
              actions.setSettings(settings);
          }
        } catch (error) {
          console.error("Не удалось обновить настройки после всех попыток:", error);
          actions.setSettings(settings);
        }
    }, [user, settings]);

    return { settings, loadSettings, updateSettings };
}

export function usePrompts() {
    const { user } = useAuth();
    const prompts = useStore(store, s => selectors.getPrompts(s));
    const activePrompt = useStore(store, s => selectors.getActivePrompt(s));

    const loadPrompts = useCallback(async () => {
        if (!user) return;
        try {
          const { data, error } = await api.fetchPrompts(user.id);
          if (error) {
            console.error("Ошибка загрузки промптов:", error);
            return;
          }
          if (data) actions.setPrompts(data as Prompt[]);
        } catch (error) {
          console.error("Не удалось загрузить промпты после всех попыток:", error);
        }
    }, [user]);

    const createPrompt = useCallback(async (name: string, content: string) => {
        if (!user) return;
        try {
          const { error } = await api.createPrompt(user.id, name, content);
          if (error) console.error("Ошибка создания промпта:", error);
          else await loadPrompts();
        } catch (error) {
          console.error("Не удалось создать промпт после всех попыток:", error);
        }
    }, [user, loadPrompts]);

    const updatePrompt = useCallback(async (id: string, name: string, content: string) => {
        if (!user) return;
        try {
          const { error } = await api.updatePrompt(user.id, id, name, content);
          if (error) {
            console.error("Ошибка обновления промпта:", error);
            throw error;
          }
          await loadPrompts();
        } catch (error) {
          console.error("Не удалось обновить промпт после всех попыток:", error);
          throw error;
        }
    }, [user, loadPrompts]);

    const deletePrompt = useCallback(async (id: string) => {
        if (!user) return;
        try {
          const { error } = await api.deletePrompt(id);
          if (error) console.error("Ошибка удаления промпта:", error);
          else await loadPrompts();
        } catch (error) {
          console.error("Не удалось удалить промпт после всех попыток:", error);
        }
    }, [user, loadPrompts]);

    const setPromptActive = useCallback(async (id: string, isActive: boolean) => {
        if (!user) return;
        try {
          await api.setPromptActive(user.id, id, isActive);
          await loadPrompts();
        } catch (error) {
          console.error("Не удалось обновить активный статус промпта:", error);
        }
    }, [user, loadPrompts]);
    
    return { 
      prompts, 
      activePrompt, 
      loadPrompts, 
      createPrompt, 
      updatePrompt,
      deletePrompt, 
      setPromptActive 
    };
}

export function useAppState() {
  const isLoading = useStore(store, s => selectors.getIsLoading(s));
  return {
    isLoading,
    setLoading: actions.setLoading
  };
}

export function useConversations() {
  const { user } = useAuth();
  const conversations = useStore(store, s => selectors.getConversations(s));
  const currentConversationId = useStore(store, s => selectors.getCurrentConversationId(s));
  const currentConversation = useStore(store, s => selectors.getCurrentConversation(s));
  const currentMessages = useStore(store, s => selectors.getCurrentMessages(s));

  const setCurrentConversationId = useCallback((id: string | null) => {
      actions.setCurrentConversationId(id);
      if (id) {
        loadMessagesForConversation(id);
      }
  }, []);

  const loadConversations = useCallback(async () => {
      if (!user) return;
      try {
        const { data, error } = await api.fetchConversations(user.id);
        if (error) console.error('Ошибка загрузки бесед:', error);
        else actions.setConversations(data as Conversation[]);
      } catch (error) {
        console.error('Не удалось загрузить беседы после всех попыток:', error);
      }
  }, [user]);

  const createNewConversation = useCallback(async (title: string = 'Новая беседа') => {
      if (!user) return null;
      console.log('[useConversations] Создание новой беседы:', title);
      try {
        const { data, error } = await api.createConversation(user.id, title);
        if (error || !data) { 
          console.error('Не удалось создать беседу в Supabase:', error); 
          return null; 
        }
        actions.addConversation(data as Conversation);
        console.log('[useConversations] Новая беседа создана:', data.id);
        return data.id;
      } catch (error) {
        console.error('Не удалось создать беседу после всех попыток:', error);
        return null;
      }
  }, [user]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
      actions.updateConversationTitle(id, title);
      try {
        const { error } = await api.updateConversationTitle(id, title);
        if (error) console.error('Не удалось обновить заголовок в Supabase:', error);
      } catch (error) {
        console.error('Не удалось обновить заголовок после всех попыток:', error);
      }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
      const messagesInConv = store.state.messageCache[id] || (await api.fetchMessages(id)).data || [];
      
      const attachmentPaths = messagesInConv
        .flatMap((msg: Message) => msg.attachments || [])
        .map((att: Attachment) => att.path)
        .filter(Boolean);

      if (attachmentPaths.length > 0) {
        await api.deleteAttachments(attachmentPaths);
      }

      actions.deleteConversation(id);
      try {
        const { error } = await api.deleteConversation(id);
        if (error) console.error('Не удалось удалить беседу из Supabase:', error);
      } catch (error) {
        console.error('Не удалось удалить беседу после всех попыток:', error);
      }
  }, []);
  
  const addMessage = useCallback(async (conversationId: string, message: Message) => {
    if (!user) return;
    console.log('[useConversations] Добавление сообщения:', message.role, message.content.substring(0, 50));
    actions.addMessageToCache(conversationId, message);
    try {
      const { error } = await api.createMessage(user.id, conversationId, message);
      if (error) console.error('Не удалось добавить сообщение в Supabase:', error);
      else console.log('[useConversations] Сообщение сохранено в Supabase:', message.id);
    } catch (error) {
      console.error('Не удалось добавить сообщение после всех попыток:', error);
    }
  }, [user]);

  // ✅ НОВЫЙ ACTION: Для обновления временного сообщения
  const updateMessage = useCallback(async (conversationId: string, messageId: string, updatedMessage: Partial<Message>) => {
    actions.updateMessageInCache(conversationId, messageId, updatedMessage);
  }, []);

  const editMessageAndUpdate = useCallback(async (messageId: string, newContent: string): Promise<Message[] | null> => {
    const convId = selectors.getCurrentConversationId(store.state);
    if (!convId) return null;

    const originalMessages = selectors.getCurrentMessages(store.state);
    const originalMessageIndex = originalMessages.findIndex(m => m.id === messageId);
    if (originalMessageIndex === -1) {
      console.error('Сообщение не найдено:', messageId);
      return null;
    }

    const messagesToDelete = originalMessages.slice(originalMessageIndex + 1);
    const idsToDelete = messagesToDelete.map(m => m.id);

    const attachmentPathsToDelete = messagesToDelete
      .flatMap(msg => msg.attachments || [])
      .map(att => att.path)
      .filter(Boolean);

    actions.editCachedMessage(convId, messageId, newContent);
    
    try {
      const promises = [];
      if (attachmentPathsToDelete.length > 0) {
        promises.push(api.deleteAttachments(attachmentPathsToDelete));
      }
      if (idsToDelete.length > 0) {
        promises.push(api.deleteMessages(idsToDelete));
      }
      promises.push(api.updateMessageContent(messageId, newContent));
      
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res.error) throw res.error;
      }
    } catch (error) {
      console.error('Не удалось обновить сообщения в Supabase после редактирования:', error);
      actions.setCachedMessages(convId, originalMessages);
      return null;
    }
    
    return selectors.getCurrentMessages(store.state);
  }, []);
  
  const duplicateConversation = useCallback(async (id: string) => {
    if (!user) return;
    const originalConversation = conversations.find(c => c.id === id);
    if (!originalConversation) return;

    try {
      const { data: messagesToCopy, error: messagesError } = await api.fetchMessages(id);
      if (messagesError) throw new Error('Не удалось загрузить сообщения для дублирования');
      if (!messagesToCopy || messagesToCopy.length === 0) throw new Error('Нельзя дублировать пустую беседу');
      if (messagesToCopy[0].role !== 'user') throw new Error('Первое сообщение должно быть от пользователя');

      const newTitle = `копия_${originalConversation.title}`;
      const { data: newConvData, error: newConvError } = await api.createConversation(user.id, newTitle);
      if (newConvError || !newConvData) throw new Error('Не удалось создать дубликат беседы');

      const { error: insertError } = await api.duplicateMessages(newConvData.id, messagesToCopy);
      if (insertError) {
        await api.deleteConversation(newConvData.id);
        throw new Error('Не удалось вставить дублированные сообщения');
      }
      
      await loadConversations();
      setCurrentConversationId(newConvData.id);
    } catch (error) {
      console.error('Не удалось дублировать беседу:', error);
    }
  }, [user, conversations, loadConversations, setCurrentConversationId]);

  return {
    conversations,
    currentConversationId,
    currentConversation,
    messages: currentMessages,
    setCurrentConversationId,
    loadConversations,
    createNewConversation,
    updateConversationTitle,
    deleteConversation,
    addMessage,
    updateMessage, // ✅ Экспортируем новый action
    editMessageAndUpdate,
    duplicateConversation,
  };
}