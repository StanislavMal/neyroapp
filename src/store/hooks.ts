// 📄 src/store/hooks.ts

import { useCallback } from 'react';
import { useStore } from '@tanstack/react-store';
import { actions, selectors, store, type Conversation, type Prompt, type UserSettings } from './store';
import type { Message } from '../lib/ai/types';
import { supabase } from '../utils/supabase';
import { retryAsync } from '../utils/retry';
import { useAuth } from '../providers/AuthProvider';
import type { PostgrestSingleResponse, PostgrestResponse } from '@supabase/supabase-js';

const loadMessagesForConversation = async (conversationId: string) => {
  if (store.state.messageCache[conversationId]) {
    console.log(`[loadMessages] Messages for ${conversationId} found in cache. Skipping fetch.`);
    return;
  }

  console.log('[loadMessages] Loading messages for conversation:', conversationId);
  try {
    const result = await retryAsync(
      async () => {
        return await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true });
      },
      {
        maxAttempts: 3,
        onRetry: (attempt, error) => {
          console.warn(`[Messages] Retry attempt ${attempt}:`, error.message);
        }
      }
    ) as PostgrestResponse<any>;
    
    const { data, error } = result;
    
    if (error) {
      console.error('Error loading messages:', error);
      actions.setCachedMessages(conversationId, []);
    } else {
      const formattedMessages = data.map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      })) as Message[];
      
      console.log('[loadMessages] Loaded messages:', formattedMessages.length);
      actions.setCachedMessages(conversationId, formattedMessages);
    }
  } catch (error) {
    console.error('Failed to load messages after all retries:', error);
    actions.setCachedMessages(conversationId, []);
  }
};


export function useSettings() {
    const { user } = useAuth();
    const settings = useStore(store, s => selectors.getSettings(s));

    const loadSettings = useCallback(async () => {
      if (!user) return;
      
      try {
        const result = await retryAsync(
          async () => {
            return await supabase.from('profiles').select('settings').eq('id', user.id).single();
          },
          {
            maxAttempts: 3,
            onRetry: (attempt, error) => {
              console.warn(`[Settings] Retry attempt ${attempt} after error:`, error.message);
            }
          }
        ) as PostgrestSingleResponse<{ settings: UserSettings | null }>;
        
        const { data, error } = result;
        
        if (error) {
          console.error("Error loading settings:", error);
          return;
        }
        
        if (data && data.settings) {
            const loadedSettings = data.settings as UserSettings;
            const settingsWithDefaults: UserSettings = {
                model: loadedSettings.model || 'gemini-2.5-flash',
                provider: loadedSettings.provider || 'gemini',
                system_instruction: loadedSettings.system_instruction || '',
                temperature: loadedSettings.temperature || 0.7,
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
            
            await retryAsync(
              async () => {
                return await supabase.from('profiles').update({ settings: defaultSettings }).eq('id', user.id);
              }
            );
        }
      } catch (error) {
        console.error("Failed to load settings after all retries:", error);
      }
    }, [user]);

    const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
        if (!user || !settings) return;
        const updated = { ...settings, ...newSettings };
        actions.setSettings(updated);
        
        try {
          const result = await retryAsync(
            async () => {
              return await supabase.from('profiles').update({ settings: updated }).eq('id', user.id);
            },
            {
              maxAttempts: 3,
              onRetry: (attempt, error) => {
                console.warn(`[Settings Update] Retry attempt ${attempt}:`, error.message);
              }
            }
          ) as PostgrestResponse<any>;
          
          if (result.error) {
              console.error("Error updating settings:", result.error);
              actions.setSettings(settings); 
          }
        } catch (error) {
          console.error("Failed to update settings after all retries:", error);
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
          const result = await retryAsync(
            async () => {
              return await supabase.from('prompts').select('*').eq('user_id', user.id).order('created_at');
            }
          ) as PostgrestResponse<Prompt>;
          
          const { data, error } = result;
          
          if (error) {
            console.error("Error loading prompts:", error);
            return;
          }
          
          if (data) actions.setPrompts(data as Prompt[]);
        } catch (error) {
          console.error("Failed to load prompts after all retries:", error);
        }
    }, [user]);

    const createPrompt = useCallback(async (name: string, content: string) => {
        if (!user) return;
        
        try {
          const result = await retryAsync(
            async () => {
              return await supabase.from('prompts').insert({ name, content, user_id: user.id });
            }
          ) as PostgrestResponse<any>;
          
          if (result.error) {
            console.error("Error creating prompt:", result.error);
          } else {
            await loadPrompts();
          }
        } catch (error) {
          console.error("Failed to create prompt after all retries:", error);
        }
    }, [user, loadPrompts]);

    const updatePrompt = useCallback(async (id: string, name: string, content: string) => {
        if (!user) return;
        
        try {
          const result = await retryAsync(
            async () => {
              return await supabase
                .from('prompts')
                .update({ name, content })
                .eq('id', id)
                .eq('user_id', user.id);
            },
            {
              maxAttempts: 3,
              onRetry: (attempt, error) => {
                console.warn(`[Update Prompt] Retry attempt ${attempt}:`, error.message);
              }
            }
          ) as PostgrestResponse<any>;
          
          if (result.error) {
            console.error("Error updating prompt:", result.error);
            throw result.error;
          } else {
            await loadPrompts();
          }
        } catch (error) {
          console.error("Failed to update prompt after all retries:", error);
          throw error;
        }
    }, [user, loadPrompts]);

    const deletePrompt = useCallback(async (id: string) => {
        if (!user) return;
        
        try {
          const result = await retryAsync(
            async () => {
              return await supabase.from('prompts').delete().eq('id', id);
            }
          ) as PostgrestResponse<any>;
          
          if (result.error) {
            console.error("Error deleting prompt:", result.error);
          } else {
            await loadPrompts();
          }
        } catch (error) {
          console.error("Failed to delete prompt after all retries:", error);
        }
    }, [user, loadPrompts]);

    const setPromptActive = useCallback(async (id: string, isActive: boolean) => {
        if (!user) return;
        
        try {
          await retryAsync(
            async () => {
              return await supabase.from('prompts').update({ is_active: false }).eq('user_id', user.id);
            }
          );
          
          if (isActive) {
              await retryAsync(
                async () => {
                  return await supabase.from('prompts').update({ is_active: true }).eq('id', id);
                }
              );
          }
          await loadPrompts();
        } catch (error) {
          console.error("Failed to update prompt active state after all retries:", error);
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
        const result = await retryAsync(
          async () => {
            return await supabase
              .from('conversations')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });
          }
        ) as PostgrestResponse<Conversation>;

        const { data, error } = result;

        if (error) { 
          console.error('Error loading conversations:', error); 
          return; 
        }
        
        actions.setConversations(data as Conversation[]);
      } catch (error) {
        console.error('Failed to load conversations after all retries:', error);
      }
  }, [user]);

  const createNewConversation = useCallback(async (title: string = 'New Conversation') => {
      if (!user) return null;
      
      console.log('[useConversations] Creating new conversation:', title);
      
      try {
        const result = await retryAsync(
          async () => {
            return await supabase
              .from('conversations')
              .insert({ title, user_id: user.id })
              .select()
              .single();
          },
          {
            maxAttempts: 3,
            onRetry: (attempt, error) => {
              console.warn(`[Create Conversation] Retry attempt ${attempt}:`, error.message);
            }
          }
        ) as PostgrestSingleResponse<Conversation>;
        
        const { data, error } = result;
        
        if (error || !data) { 
          console.error('Failed to create conversation in Supabase:', error); 
          return null; 
        }
        
        const newConversation: Conversation = data as Conversation;
        
        actions.addConversation(newConversation);
        
        console.log('[useConversations] New conversation created:', newConversation.id);
        return newConversation.id;
      } catch (error) {
        console.error('Failed to create conversation after all retries:', error);
        return null;
      }
  }, [user]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
      actions.updateConversationTitle(id, title);
      
      try {
        const result = await retryAsync(
          async () => {
            return await supabase.from('conversations').update({ title }).eq('id', id);
          }
        ) as PostgrestResponse<any>;
        
        if (result.error) {
          console.error('Failed to update title in Supabase:', result.error);
        }
      } catch (error) {
        console.error('Failed to update title after all retries:', error);
      }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
      actions.deleteConversation(id);
      
      try {
        const result = await retryAsync(
          async () => {
            return await supabase.from('conversations').delete().eq('id', id);
          }
        ) as PostgrestResponse<any>;
        
        if (result.error) {
          console.error('Failed to delete conversation from Supabase:', result.error);
        }
      } catch (error) {
        console.error('Failed to delete conversation after all retries:', error);
      }
  }, []);
  
  const addMessage = useCallback(async (conversationId: string, message: Message) => {
    if (!user) return;

    console.log('[useConversations] Adding message:', message.role, message.content.substring(0, 50));
    
    actions.addMessageToCache(conversationId, message);

    try {
      const result = await retryAsync(
        async () => {
          return await supabase.from('messages').insert({
            id: message.id,
            conversation_id: conversationId,
            user_id: user.id,
            role: message.role,
            content: message.content
          });
        },
        {
          maxAttempts: 3,
          onRetry: (attempt, error) => {
            console.warn(`[Add Message] Retry attempt ${attempt}:`, error.message);
          }
        }
      ) as PostgrestResponse<any>;

      if (result.error) {
        console.error('Failed to add message to Supabase:', result.error);
      } else {
        console.log('[useConversations] Message saved to Supabase:', message.id);
      }
    } catch (error) {
      console.error('Failed to add message after all retries:', error);
    }
  }, [user]);

  const editMessageAndUpdate = useCallback(async (messageId: string, newContent: string): Promise<Message[] | null> => {
    const convId = selectors.getCurrentConversationId(store.state);
    if (!convId) return null;

    const originalMessages = selectors.getCurrentMessages(store.state);
    const originalMessageIndex = originalMessages.findIndex(m => m.id === messageId);
    
    if (originalMessageIndex === -1) {
      console.error('Message not found:', messageId);
      return null;
    }

    const idsToDelete = originalMessages
      .slice(originalMessageIndex + 1)
      .map(m => m.id);

    actions.editCachedMessage(convId, messageId, newContent);
    
    try {
      const promises: Promise<PostgrestResponse<any>>[] = [];

      if (idsToDelete.length > 0) {
        promises.push(
          retryAsync(async () => {
            return await supabase.from('messages').delete().in('id', idsToDelete);
          }) as Promise<PostgrestResponse<any>>
        );
      }

      promises.push(
        retryAsync(async () => {
          return await supabase
            .from('messages')
            .update({ content: newContent })
            .eq('id', messageId);
        }) as Promise<PostgrestResponse<any>>
      );
      
      const results = await Promise.all(promises);
      
      for (const res of results) {
        if (res.error) throw res.error;
      }

    } catch (error) {
      console.error('Failed to update messages in Supabase after edit:', error);
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
      const messagesResult = await retryAsync(
        async () => {
          return await supabase
            .from('messages')
            .select('role, content, user_id, created_at')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
        }
      ) as PostgrestResponse<any>;

      const { data: messagesToCopy, error: messagesError } = messagesResult;

      if (messagesError) {
        console.error('Failed to load messages for duplication:', messagesError);
        return;
      }

      if (!messagesToCopy || messagesToCopy.length === 0) {
        console.warn('Cannot duplicate empty conversation');
        return;
      }

      if (messagesToCopy[0].role !== 'user') {
        console.error('First message must be from user. Skipping duplicate.');
        return;
      }

      const newTitle = `copy_${originalConversation.title}`;
      const convResult = await retryAsync(
        async () => {
          return await supabase
            .from('conversations')
            .insert({ title: newTitle, user_id: user.id })
            .select()
            .single();
        }
      ) as PostgrestSingleResponse<Conversation>;

      const { data: newConvData, error: newConvError } = convResult;

      if (newConvError || !newConvData) {
        console.error('Failed to create duplicated conversation:', newConvError);
        return;
      }

      const newConversation = newConvData as Conversation;

      const newMessages = messagesToCopy.map((msg: any) => ({
        ...msg,
        conversation_id: newConversation.id,
      }));
      
      const insertResult = await retryAsync(
        async () => {
          return await supabase.from('messages').insert(newMessages);
        }
      ) as PostgrestResponse<any>;
      
      if (insertResult.error) {
        console.error('Failed to insert duplicated messages:', insertResult.error);
        await supabase.from('conversations').delete().eq('id', newConversation.id);
        return;
      }
      
      await loadConversations();
      setCurrentConversationId(newConversation.id);
    } catch (error) {
      console.error('Failed to duplicate conversation after all retries:', error);
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
    editMessageAndUpdate,
    duplicateConversation,
  };
}