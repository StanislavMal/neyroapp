// 📄 src/store/store.ts

import { Store } from '@tanstack/store'
import type { Message } from '../lib/ai/types'

export interface Prompt {
  id: string
  name: string
  content: string
  is_active: boolean
  user_id?: string
  created_at?: string
}

export interface UserSettings {
  model: string
  provider: 'gemini' | 'deepseek' | 'openai' | 'anthropic'
  system_instruction: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  streamSpeed?: number
  userId?: string
}

export interface Conversation {
  id: string
  title: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface State {
  prompts: Prompt[]
  settings: UserSettings | null
  conversations: Conversation[]  
  messageCache: Record<string, Message[]>
  currentConversationId: string | null
  isLoading: boolean
}

const initialState: State = {
  prompts: [],
  settings: null,
  conversations: [],

  messageCache: {},
  currentConversationId: null,
  isLoading: false,
}

export const store = new Store<State>(initialState)

export const actions = {
  resetStore: () => {
    store.setState(() => initialState);
  },

  setCachedMessages: (conversationId: string, messages: Message[]) => {
    store.setState(state => ({
      ...state,
      messageCache: {
        ...state.messageCache,
        [conversationId]: messages,
      },
    }));
  },

  addMessageToCache: (conversationId: string, message: Message) => {
    store.setState(state => {
      const existingMessages = state.messageCache[conversationId] || [];
      if (existingMessages.some(m => m.id === message.id)) {
        return state;
      }
      return {
        ...state,
        messageCache: {
          ...state.messageCache,
          [conversationId]: [...existingMessages, message],
        },
      };
    });
  },

  updateMessageInCache: (conversationId: string, messageId: string, updatedMessage: Partial<Message>) => {
    store.setState(state => {
      const messages = state.messageCache[conversationId] || [];
      const msgIndex = messages.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return state;

      const newMessages = [...messages];
      newMessages[msgIndex] = { ...newMessages[msgIndex], ...updatedMessage };

      return {
        ...state,
        messageCache: {
          ...state.messageCache,
          [conversationId]: newMessages,
        },
      };
    });
  },

  editCachedMessage: (conversationId: string, messageId: string, newContent: string) => {
    store.setState(state => {
      const messages = state.messageCache[conversationId] || [];
      const msgIndex = messages.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return state;

      const newMessages = [...messages];
      newMessages[msgIndex] = { ...newMessages[msgIndex], content: newContent };
      const finalMessages = newMessages.slice(0, msgIndex + 1);

      return {
        ...state,
        messageCache: {
          ...state.messageCache,
          [conversationId]: finalMessages,
        },
      };
    });
  },

  clearCachedMessages: (conversationId: string) => {
    store.setState(state => {
      const newCache = { ...state.messageCache };
      delete newCache[conversationId];
      return { ...state, messageCache: newCache };
    });
  },

  setSettings: (settings: UserSettings) => {
    store.setState(state => ({ ...state, settings }));
  },
  
  setPrompts: (prompts: Prompt[]) => {
    store.setState(state => ({ ...state, prompts }));
  },

  setConversations: (conversations: Conversation[]) => {
    store.setState(state => ({ ...state, conversations }))
  },

  setCurrentConversationId: (id: string | null) => {
    store.setState(state => ({ ...state, currentConversationId: id }));
  },

  addConversation: (conversation: Conversation) => {
    store.setState(state => ({
      ...state,
      conversations: [conversation, ...state.conversations],
      currentConversationId: conversation.id,
      messageCache: { ...state.messageCache, [conversation.id]: [] },
    }));
  },

  updateConversationTitle: (id: string, title: string) => {
    store.setState(state => ({
      ...state,
      conversations: state.conversations.map(conv =>
        conv.id === id ? { ...conv, title } : conv
      )
    }))
  },

  deleteConversation: (id: string) => {
    actions.clearCachedMessages(id);
    store.setState(state => ({
      ...state,
      conversations: state.conversations.filter(conv => conv.id !== id),
      currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
    }));
  },
  
  setLoading: (isLoading: boolean) => {
    store.setState(state => ({ ...state, isLoading }))
  },
  
  mergeConversations: (newConversations: Conversation[]) => {
    store.setState(state => {
      const convMap = new Map(state.conversations.map(c => [c.id, c]));
      newConversations.forEach(c => convMap.set(c.id, c));
      const merged = Array.from(convMap.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { ...state, conversations: merged };
    });
  },

  mergeMessages: (conversationId: string, newMessages: Message[]) => {
    store.setState(state => {
      const existingMessages = state.messageCache[conversationId] || [];
      const msgMap = new Map(existingMessages.map(m => [m.id, m]));
      newMessages.forEach(m => msgMap.set(m.id, m));
      
      const merged = Array.from(msgMap.values()).sort((a, b) => {
        // @ts-ignore
        const dateA = new Date(a.created_at || 0).getTime();
        // @ts-ignore
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });

      return {
        ...state,
        messageCache: {
          ...state.messageCache,
          [conversationId]: merged,
        },
      };
    });
  },
}

export const selectors = {
  getSettings: (state: State) => state.settings,
  getActivePrompt: (state: State) => state.prompts.find(p => p.is_active),
  getPrompts: (state: State) => state.prompts,
  getCurrentConversation: (state: State) => 
    state.conversations.find(c => c.id === state.currentConversationId),
  getConversations: (state: State) => state.conversations,
  getCurrentConversationId: (state: State) => state.currentConversationId,
  getIsLoading: (state: State) => state.isLoading,
  getCurrentMessages: (state: State) => {
    if (!state.currentConversationId) return [];
    return state.messageCache[state.currentConversationId] || [];
  },
}