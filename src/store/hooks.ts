// 📄 src/store/hooks.ts

import { useCallback } from 'react';
import { useStore } from '@tanstack/react-store';
import { actions, selectors, store, type Conversation, type Prompt, type UserSettings } from './store';
import type { Message, Attachment } from '../lib/ai/types';
import { useAuth } from '../providers/AuthProvider';
import * as api from '../services/supabase';
import { getDbManager, STORES } from '../services/db-manager';

// --- Хук для настроек ---
export function useSettings() {
    const { user } = useAuth();
    const settings = useStore(store, s => selectors.getSettings(s));

    const loadSettings = useCallback(async () => {
      if (!user) return;
      const dbManager = getDbManager(user.id);
      
      const cachedSettings = await dbManager.get<UserSettings>(STORES.settings, user.id);
      if (cachedSettings) {
        actions.setSettings(cachedSettings);
      }

      try {
        const { data, error } = await api.fetchSettings(user.id);
        if (error) throw error;
        
        const serverSettings = data?.settings || {};
        const settingsWithDefaults: UserSettings = {
            userId: user.id,
            model: serverSettings.model || 'gemini-2.5-flash',
            provider: serverSettings.provider || 'gemini',
            system_instruction: serverSettings.system_instruction || '',
            temperature: serverSettings.temperature ?? 0.7,
            maxTokens: serverSettings.maxTokens || 8192,
            reasoningEffort: serverSettings.reasoningEffort || 'none',
            streamSpeed: serverSettings.streamSpeed || 30,
        };
        
        actions.setSettings(settingsWithDefaults);
        await dbManager.put(STORES.settings, settingsWithDefaults);

      } catch (error) {
        console.error("Не удалось загрузить настройки с сервера:", error);
        if (!cachedSettings) {
            const defaultSettings: UserSettings = {
                userId: user.id,
                model: 'gemini-2.5-flash', provider: 'gemini', system_instruction: '',
                temperature: 0.7, maxTokens: 8192, reasoningEffort: 'none', streamSpeed: 30,
            };
            actions.setSettings(defaultSettings);
            await dbManager.put(STORES.settings, defaultSettings);
            await api.updateSettings(user.id, defaultSettings);
        }
      }
    }, [user]);

    const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
        if (!user || !settings) return;
        const dbManager = getDbManager(user.id);
        const updated = { ...settings, ...newSettings };
        
        actions.setSettings(updated);
        await dbManager.put(STORES.settings, updated);
        
        try {
          const { error } = await api.updateSettings(user.id, updated);
          if (error) throw error;
        } catch (error) {
          console.error("Не удалось обновить настройки на сервере:", error);
          actions.setSettings(settings);
          await dbManager.put(STORES.settings, settings);
        }
    }, [user, settings]);

    return { settings, loadSettings, updateSettings };
}


// --- Хук для промптов ---
export function usePrompts() {
    const { user } = useAuth();
    const prompts = useStore(store, s => selectors.getPrompts(s));
    const activePrompt = useStore(store, s => selectors.getActivePrompt(s));

    const loadPrompts = useCallback(async () => {
        if (!user) return;
        const dbManager = getDbManager(user.id);
        const cached = await dbManager.getAll<Prompt>(STORES.prompts);
        actions.setPrompts(cached);

        try {
          const { data, error } = await api.fetchPrompts(user.id);
          if (error) throw error;
          if (data) {
            actions.setPrompts(data as Prompt[]);
            await dbManager.clear(STORES.prompts);
            await dbManager.bulkPut(STORES.prompts, data);
          }
        } catch (error) {
          console.error("Не удалось синхронизировать промпты:", error);
        }
    }, [user]);

    const createPrompt = useCallback(async (name: string, content: string) => {
        if (!user) return;
        try {
          await api.createPrompt(user.id, name, content);
          await loadPrompts();
        } catch (error) {
          console.error("Не удалось создать промпт:", error);
        }
    }, [user, loadPrompts]);

    const updatePrompt = useCallback(async (id: string, name: string, content: string) => {
        if (!user) return;
        try {
          await api.updatePrompt(user.id, id, name, content);
          await loadPrompts();
        } catch (error) {
          console.error("Не удалось обновить промпт:", error);
          throw error;
        }
    }, [user, loadPrompts]);

    const deletePrompt = useCallback(async (id: string) => {
        if (!user) return;
        try {
          await api.deletePrompt(id);
          await loadPrompts();
        } catch (error) {
          console.error("Не удалось удалить промпт:", error);
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
    
    return { prompts, activePrompt, loadPrompts, createPrompt, updatePrompt, deletePrompt, setPromptActive };
}

// --- Хук для бесед и сообщений ---
export function useConversations() {
  const { user } = useAuth();
  const conversations = useStore(store, s => selectors.getConversations(s));
  const currentConversationId = useStore(store, s => selectors.getCurrentConversationId(s));
  const currentConversation = useStore(store, s => selectors.getCurrentConversation(s));
  const currentMessages = useStore(store, s => selectors.getCurrentMessages(s));
  const deletingConversationIds = useStore(store, s => selectors.getDeletingConversationIds(s));

  const syncConversations = useCallback(async () => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    try {
      const lastSync = await dbManager.getLastSyncTimestamp('conversations_sync') || new Date(0).toISOString();
      const { data, error } = await api.fetchUpdatedConversations(user.id, lastSync);
      if (error) throw error;
      
      if (data && data.length > 0) {
        const toUpdate: Conversation[] = [];
        const toDeleteIds: string[] = [];

        data.forEach((conv: Conversation & { deleted_at?: string | null }) => {
          if (conv.deleted_at) {
            toDeleteIds.push(conv.id);
          } else {
            toUpdate.push(conv);
          }
        });

        if (toUpdate.length > 0) {
          await dbManager.bulkPut(STORES.conversations, toUpdate);
          actions.mergeConversations(toUpdate);
        }
        if (toDeleteIds.length > 0) {
          for (const id of toDeleteIds) {
            try {
              actions.startDeletingConversation(id);
              const messagesInConv = await dbManager.getByIndex<Message>(STORES.messages, 'conversation_id', id);
              if (messagesInConv.length > 0) {
                const attachmentPaths = messagesInConv.flatMap(m => m.attachments?.map(a => a.path) ?? []).filter(Boolean);
                if (attachmentPaths.length > 0) {
                  await dbManager.bulkDeleteImages(attachmentPaths);
                }
                await dbManager.bulkDelete(STORES.messages, messagesInConv.map(m => m.id));
              }
              await dbManager.delete(STORES.conversations, id);
              actions.finishDeletingConversation(id);
            } catch (e) {
              console.error(`[Sync] Ошибка при обработке удаления диалога ${id}:`, e);
              actions.finishDeletingConversation(id);
            }
          }
        }
      }
      await dbManager.setLastSyncTimestamp('conversations_sync', new Date().toISOString());
    } catch (error) {
      console.error('Failed to sync conversations:', error);
    }
  }, [user]);

  const loadInitialConversations = useCallback(async () => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    const cachedConversations = await dbManager.getAll<Conversation>(STORES.conversations);
    
    const activeCached = cachedConversations.filter(c => !(c as any).deleted_at);
    
    activeCached.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    actions.setConversations(activeCached);
  }, [user]);
  
  const loadMessagesForConversation = useCallback(async (conversationId: string) => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    const cachedMessages = await dbManager.getByIndex<Message>(STORES.messages, 'conversation_id', conversationId);
    
    cachedMessages.sort((a, b) => {
      // @ts-ignore
      const dateA = new Date(a.created_at || 0).getTime();
      // @ts-ignore
      const dateB = new Date(b.created_at || 0).getTime();
      return dateA - dateB;
    });

    actions.setCachedMessages(conversationId, cachedMessages);

    try {
      const lastSync = await dbManager.getLastSyncTimestamp(`messages_sync_${conversationId}`) || new Date(0).toISOString();
      const { data, error } = await api.fetchUpdatedMessages(conversationId, lastSync);
      if (error) throw error;

      if (data && data.length > 0) {
        const messages = data as unknown as Message[];
        
        await dbManager.bulkPut(STORES.messages, messages);
        actions.mergeMessages(conversationId, messages);
      }
      await dbManager.setLastSyncTimestamp(`messages_sync_${conversationId}`, new Date().toISOString());
    } catch (error) {
      console.error(`Failed to sync messages for ${conversationId}:`, error);
    }
  }, [user]);

  const setCurrentConversationId = useCallback((id: string | null) => {
    actions.setCurrentConversationId(id);
    if (id) {
      loadMessagesForConversation(id);
    }
  }, [loadMessagesForConversation]);

  const createNewConversation = useCallback(async (title: string = 'Новая беседа') => {
    if (!user) return null;
    const dbManager = getDbManager(user.id);
    try {
      const { data, error } = await api.createConversation(user.id, title);
      if (error || !data) throw error || new Error("Failed to create conversation");

      const newConv = data as Conversation;
      await dbManager.put(STORES.conversations, newConv);
      actions.addConversation(newConv);
      return newConv.id;
    } catch (error) {
      console.error('Failed to create new conversation:', error);
      return null;
    }
  }, [user]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!user || deletingConversationIds.has(id)) return;
    const dbManager = getDbManager(user.id);
    actions.startDeletingConversation(id);

    try {
        const messagesInConv = await dbManager.getByIndex<Message>(STORES.messages, 'conversation_id', id);
        if (messagesInConv.length > 0) {
            const attachmentPaths = messagesInConv.flatMap(m => m.attachments?.map(a => a.path) ?? []).filter(Boolean);
            if (attachmentPaths.length > 0) {
                await dbManager.bulkDeleteImages(attachmentPaths);
            }
            await dbManager.bulkDelete(STORES.messages, messagesInConv.map(m => m.id));
        }
        
        await dbManager.delete(STORES.conversations, id);

        api.deleteConversation(id).catch(error => {
            console.error('[Delete] Фоновое удаление на сервере не удалось:', error);
        });

    } catch (error) {
        console.error('[Delete] Произошла ошибка при удалении диалога:', error);
    } finally {
        actions.finishDeletingConversation(id);
    }
  }, [user, deletingConversationIds]);
  
  const addMessage = useCallback(async (conversationId: string, message: Message) => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    
    // @ts-ignore
    const fullMessage: Message = { ...message, conversation_id: conversationId, user_id: user.id, created_at: new Date().toISOString() };

    actions.addMessageToCache(conversationId, fullMessage);
    await dbManager.put(STORES.messages, fullMessage);

    try {
      const { error } = await api.createMessage(user.id, conversationId, message);
      if (error) throw error;
      await syncConversations();
    } catch (error) {
      console.error('Failed to save message to server:', error);
    }
  }, [user, syncConversations]);

  const updateMessage = useCallback(async (conversationId: string, messageId: string, updatedFields: Partial<Message>) => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    actions.updateMessageInCache(conversationId, messageId, updatedFields);
    const message = selectors.getCurrentMessages(store.state).find(m => m.id === messageId);
    if (message) {
      await dbManager.put(STORES.messages, message);
    }
  }, [user]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    actions.updateConversationTitle(id, title);
    const conversation = await dbManager.get<Conversation>(STORES.conversations, id);
    if (conversation) {
        conversation.title = title;
        await dbManager.put(STORES.conversations, conversation);
    }
    try {
      await api.updateConversationTitle(id, title);
    } catch (error) {
      console.error('Не удалось обновить заголовок в Supabase:', error);
    }
  }, [user]);

  const editMessageAndUpdate = useCallback(async (messageId: string, newContent: string): Promise<Message[] | null> => {
    if (!user) return null;
    const dbManager = getDbManager(user.id);
    const convId = selectors.getCurrentConversationId(store.state);
    if (!convId) return null;

    const originalMessages = selectors.getCurrentMessages(store.state);
    const originalMessageIndex = originalMessages.findIndex(m => m.id === messageId);
    if (originalMessageIndex === -1) return null;

    const messagesToDelete = originalMessages.slice(originalMessageIndex + 1);
    const idsToDelete = messagesToDelete.map(m => m.id);
    const attachmentPathsToDelete = messagesToDelete.flatMap(msg => msg.attachments || []).map(att => att.path).filter(Boolean);

    actions.editCachedMessage(convId, messageId, newContent);
    const updatedMessages = selectors.getCurrentMessages(store.state);
    await dbManager.bulkPut(STORES.messages, updatedMessages);
    await dbManager.bulkDelete(STORES.messages, idsToDelete);
    
    try {
      const promises = [];
      if (attachmentPathsToDelete.length > 0) promises.push(api.deleteAttachments(attachmentPathsToDelete));
      if (idsToDelete.length > 0) promises.push(api.deleteMessages(idsToDelete));
      promises.push(api.updateMessageContent(messageId, newContent));
      
      await Promise.all(promises);
    } catch (error) {
      console.error('Не удалось обновить сообщения в Supabase после редактирования:', error);
      actions.setCachedMessages(convId, originalMessages);
      await dbManager.bulkPut(STORES.messages, originalMessages);
      return null;
    }
    
    return updatedMessages;
  }, [user]);
  
  const duplicateConversation = useCallback(async (id: string) => {
    if (!user) return;
    const originalConversation = conversations.find(c => c.id === id);
    if (!originalConversation) return;

    let newConvData: Conversation | null = null;

    try {
      const { data: messagesToCopy, error: messagesError } = await api.fetchMessages(id);
      if (messagesError || !messagesToCopy) throw new Error('Не удалось загрузить сообщения для дублирования');
      
      const newTitle = `копия_${originalConversation.title}`;
      const { data, error: newConvError } = await api.createConversation(user.id, newTitle);
      if (newConvError || !data) throw new Error('Не удалось создать дубликат беседы');
      newConvData = data as Conversation;

      // @ts-ignore
      const newMessagesToInsert = await Promise.all(messagesToCopy.map(async (message: Message & { created_at: string }) => {
        let newAttachments: Attachment[] = [];
        if (message.attachments && message.attachments.length > 0) {
          const signedUrls = await api.createSignedUrls(message.attachments.map(a => a.path));
          const urlMap = new Map(signedUrls.map(item => [item.path, item.signedUrl]));

          for (const attachment of message.attachments) {
            const signedUrl = urlMap.get(attachment.path);
            if (!signedUrl) continue;
            
            const response = await fetch(signedUrl);
            const blob = await response.blob();
            const file = new File([blob], attachment.path.split('/').pop() || 'file', { type: blob.type });

            const newPath = await api.uploadAttachment(user.id, file);
            const newSignedUrls = await api.createSignedUrls([newPath]);
            if (newSignedUrls.length > 0) {
              newAttachments.push({ type: 'image', path: newPath, url: newSignedUrls[0].signedUrl });
            }
          }
        }
        
        return {
          conversation_id: newConvData!.id,
          user_id: user.id,
          role: message.role,
          content: message.content,
          attachments: newAttachments.length > 0 ? newAttachments : undefined,
          created_at: message.created_at, 
        };
      }));

      if (newMessagesToInsert.length > 0) {
        // @ts-ignore
        await api.bulkInsertMessages(newMessagesToInsert);
      }
      
      await syncConversations();
      setCurrentConversationId(newConvData.id);

    } catch (error) {
      console.error('Не удалось дублировать беседу:', error);
      if (newConvData) {
        await api.deleteConversation(newConvData.id);
      }
    }
  }, [user, conversations, syncConversations, setCurrentConversationId]);

  return {
    conversations,
    currentConversationId,
    currentConversation,
    messages: currentMessages,
    deletingConversationIds,
    setCurrentConversationId,
    loadInitialConversations,
    syncConversations,
    createNewConversation,
    updateConversationTitle,
    deleteConversation,
    addMessage,
    updateMessage,
    editMessageAndUpdate,
    duplicateConversation,
  };
}