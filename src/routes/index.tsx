// 📄 src/routes/index.tsx

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type PanelOnCollapse } from 'react-resizable-panels';
import { supabase } from '../utils/supabase';
import { useAuth } from '../providers/AuthProvider';
import {
  SettingsDialog,
  Sidebar,
  ScrollDownButton,
  Header,
  ChatArea,
  Footer,
} from '../components';
import type { FooterRef } from '../components/Footer';
import {
  useChat,
  useSidebar,
  useScrollManagement,
  useMediaQuery,
} from '../hooks';
import { useConversations, useSettings, usePrompts, actions, store } from '../store';
import type { Conversation, UserSettings, Prompt } from '../store';
import type { Message } from '../lib/ai/types';

type MessageWithConversationId = Message & { conversation_id: string };
type ProfilePayload = { id: string; settings: UserSettings | null };

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { user, isInitialized } = useAuth();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  const [appState, setAppState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const footerRef = useRef<FooterRef>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  const { messages, currentConversationId, loadConversations } = useConversations();
  const { loadSettings } = useSettings();
  const { loadPrompts } = usePrompts();
  
  const { sendMessage, editAndRegenerate, isLoading, error, pendingMessage } = useChat({
    onResponseStart: () => {
      lockToBottom();
    },
  });
  
  const {
    messagesContainerRef,
    contentRef,
    showScrollDownButton,
    scrollToBottom,
    lockToBottom,
  } = useScrollManagement(messages.length + (pendingMessage ? 1 : 0));
  const shouldShowScrollDownButton = showScrollDownButton && !isInputFocused && !isModelSelectorOpen;

  useEffect(() => {
    if (!isInitialized) return;

    if (!user) {
      navigate({ to: '/login', replace: true });
      return;
    }

    if (appState === 'loading') {
      const loadInitialData = async () => {
        try {
          console.log('Loading settings...');
          await loadSettings();
          console.log('Loading prompts...');
          await loadPrompts();
          console.log('Loading conversations...');
          await loadConversations();
          
          setAppState('ready');
        } catch (error) {
          console.error("Failed to load initial data:", error);
          setLoadError('Failed to load your data. Please refresh the page.');
          setAppState('error');
        }
      };
      loadInitialData();
    }
  }, [user, isInitialized, appState, navigate, loadConversations, loadPrompts, loadSettings]);

  useEffect(() => {
    if (appState !== 'ready' || !user) return;

    const channels = [
      supabase.channel('conversations-changes').on<Conversation>(
        'postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${user.id}` },
        () => { loadConversations(); }
      ).subscribe(),
      supabase.channel('messages-changes').on<MessageWithConversationId>(
        'postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}`},
        (payload) => {
          if (store.state.currentConversationId === payload.new.conversation_id) {
             actions.addMessageToCache(payload.new.conversation_id, payload.new as Message);
          }
        }
      ).subscribe(),
      supabase.channel('profiles-changes').on<ProfilePayload>(
        'postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}`},
        (payload) => { if (payload.new.settings) { actions.setSettings(payload.new.settings); } }
      ).subscribe(),
      supabase.channel('prompts-changes').on<Prompt>(
        'postgres_changes', { event: '*', schema: 'public', table: 'prompts', filter: `user_id=eq.${user.id}`},
        () => { loadPrompts(); }
      ).subscribe()
    ];

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [appState, user, loadPrompts, loadConversations]);

  const sidebar = useSidebar();
  
  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim() || isLoading) return;
      lockToBottom();      
      footerRef.current?.resetInput();
      const words = message.trim().split(/\s+/);
      const title = words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
      await sendMessage(message, title);
    },
    [isLoading, sendMessage, lockToBottom]
  );

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate({ to: '/login', replace: true });
  }, [navigate]);

  const handleStartEdit = useCallback((id: string) => setEditingMessageId(id), []);
  const handleCancelEdit = useCallback(() => setEditingMessageId(null), []);

  const handleSaveEdit = useCallback(
    async (id: string, newContent: string) => {
      setEditingMessageId(null);
      await editAndRegenerate(id, newContent);
    },
    [editAndRegenerate]
  );
  
  const sidebarProps = {
    conversations: sidebar.conversations,
    currentConversationId: sidebar.currentConversationId,
    handleNewChat: sidebar.handleNewChat,
    setCurrentConversationId: sidebar.handleSelectChat,
    handleDeleteChat: sidebar.handleDeleteChat,
    handleDuplicateChat: sidebar.handleDuplicateChat,
    editingChatId: sidebar.editingChatId,
    setEditingChatId: (id: string | null) => {
      const conversation = sidebar.conversations.find((c) => c.id === id);
      if (id && conversation) {
        sidebar.handleStartEdit(id, conversation.title);
      } else {
        sidebar.handleCancelEdit();
      }
    },
    editingTitle: sidebar.editingTitle,
    setEditingTitle: sidebar.setEditingTitle,
    handleUpdateChatTitle: sidebar.handleSaveEdit,
    isOpen: sidebar.isOpen,
    setIsOpen: sidebar.setIsOpen,
    isCollapsed: sidebar.isCollapsed,
  };
  
  if (appState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-400">Loading your data...</p>
        </div>
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center max-w-md px-4">
          <h2 className="text-xl font-semibold text-white mb-2">Loading Error</h2>
          <p className="text-gray-400 mb-6">{loadError}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const chatAreaProps = {
    messages,
    pendingMessage,
    isThinking: isLoading && !pendingMessage,
    error,
    currentConversationId,
    editingMessageId,
    onStartEdit: handleStartEdit,
    onCancelEdit: handleCancelEdit,
    onSaveEdit: handleSaveEdit,
  };

  if (appState === 'ready') {
    if (isDesktop) {
      return (
        <div className="h-[100dvh] bg-gray-900 text-white overflow-hidden">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} maxSize={30} collapsible={true} collapsedSize={0} onCollapse={sidebar.toggleCollapse as PanelOnCollapse} className="flex flex-col">
              <Sidebar {...sidebarProps} isOpen={true} setIsOpen={() => {}} />
            </Panel>
            <PanelResizeHandle className="w-2 bg-gray-800 hover:bg-orange-500/50 transition-colors duration-200 cursor-col-resize" />
            <Panel className="flex-1 flex flex-col min-h-0">
              <Header 
                onMenuClick={() => {}} 
                onSettingsClick={() => setIsSettingsOpen(true)} 
                onLogout={handleLogout} 
                isMobile={false} 
                onModelSelectorOpenChange={setIsModelSelectorOpen}
              />
              <main ref={messagesContainerRef} className="flex-1 overflow-y-auto">
                <div className={`w-full max-w-5xl mx-auto ${!currentConversationId ? 'h-full flex items-center justify-center' : ''}`}>
                  <ChatArea {...chatAreaProps} ref={contentRef} />
                </div>
              </main>
              {shouldShowScrollDownButton && <ScrollDownButton onClick={scrollToBottom} className="bottom-28 right-10" />}
              <Footer 
                ref={footerRef} 
                onSend={handleSend} 
                isLoading={isLoading} 
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
              />
            </Panel>
          </PanelGroup>
          <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onLogout={handleLogout} />
        </div>
      );
    }
  
    return (
      <div className="h-[100dvh] bg-gray-900 text-white flex flex-col relative overflow-hidden">
        {sidebar.isOpen && <div className="fixed inset-0 z-20 bg-black/50" onClick={() => sidebar.setIsOpen(false)} />}
        <Sidebar {...sidebarProps} />
        <Header 
          onMenuClick={sidebar.toggleSidebar} 
          onSettingsClick={() => setIsSettingsOpen(true)} 
          onLogout={handleLogout} 
          isMobile={true} 
          onModelSelectorOpenChange={setIsModelSelectorOpen}
        />
        <main ref={messagesContainerRef} className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 ${!currentConversationId ? 'flex items-center justify-center' : ''}`}>
          <div className="w-full">
            <ChatArea {...chatAreaProps} ref={contentRef} />
          </div>
        </main>
        {shouldShowScrollDownButton && <ScrollDownButton onClick={scrollToBottom} className="bottom-24 right-4" />}
        <Footer 
          ref={footerRef} 
          onSend={handleSend} 
          isLoading={isLoading} 
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
        />
        <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onLogout={handleLogout} />
      </div>
    );
  }

  return null;
}