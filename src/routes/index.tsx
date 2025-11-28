// 📄 src/routes/index.tsx

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import { supabase } from '../utils/supabase';
import { useAuth } from '../providers/AuthProvider';
import { DesktopLayout, MobileLayout } from '../components';
import type { FooterRef } from '../components/Footer';
import {
  useChat,
  useSidebar,
  useScrollManagement,
  useMediaQuery,
  useSupabaseSubscriptions,
} from '../hooks';
import { useConversations, useSettings, usePrompts } from '../store';

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const footerRef = useRef<FooterRef>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  const { messages, currentConversationId, loadConversations } = useConversations();
  const { loadSettings } = useSettings();
  const { loadPrompts } = usePrompts();
  
  const { sendMessage, editAndRegenerate, isLoading, error, pendingMessage } = useChat({
    onResponseStart: () => lockToBottom(),
  });
  
  const {
    messagesContainerRef,
    contentRef,
    showScrollDownButton,
    scrollToBottom,
    lockToBottom,
  } = useScrollManagement(messages.length + (pendingMessage ? 1 : 0));

  const sidebar = useSidebar();

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      navigate({ to: '/login', replace: true });
      return;
    }

    if (appState === 'loading') {
      const loadInitialData = async () => {
        try {
          console.log('Загрузка начальных данных...');
          await Promise.all([loadSettings(), loadPrompts(), loadConversations()]);
          setAppState('ready');
        } catch (error) {
          console.error("Ошибка при загрузке начальных данных:", error);
          setLoadError('Не удалось загрузить ваши данные. Пожалуйста, обновите страницу.');
          setAppState('error');
        }
      };
      loadInitialData();
    }
  }, [user, isInitialized, appState, navigate, loadConversations, loadPrompts, loadSettings]);

  useSupabaseSubscriptions({ user, loadConversations, loadPrompts });

  const allImages = useMemo(() => 
    messages.flatMap(msg => msg.attachments?.filter(att => att.type === 'image').map(att => ({ src: att.url })) ?? [])
  , [messages]);

  const handleImageClick = useCallback((messageId: string, attachmentIndex: number) => {
    let globalIndex = 0;
    let found = false;
    for (const msg of messages) {
      const imageAttachments = msg.attachments?.filter(att => att.type === 'image') ?? [];
      if (msg.id === messageId) {
        globalIndex += attachmentIndex;
        found = true;
        break;
      }
      globalIndex += imageAttachments.length;
    }

    if (found) {
      setLightboxIndex(globalIndex);
      setLightboxOpen(true);
    }
  }, [messages]);

  const handleSend = useCallback(
    async (message: string, attachments?: File[] | null, blobUrls?: string[]) => {
      const textMessage = message || '';
      const hasAttachments = attachments && attachments.length > 0;
      
      if (!textMessage.trim() && !hasAttachments || isLoading) {
        return;
      }
      
      lockToBottom();      
      footerRef.current?.resetInput();
      
      await sendMessage(textMessage, attachments, blobUrls);
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
    ...sidebar,
    setCurrentConversationId: sidebar.handleSelectChat,
    handleUpdateChatTitle: sidebar.handleSaveEdit,
    setEditingChatId: (id: string | null) => {
      const conversation = sidebar.conversations.find((c) => c.id === id);
      if (id && conversation) {
        sidebar.handleStartEdit(id, conversation.title);
      } else {
        sidebar.handleCancelEdit();
      }
    },
  };

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
    setIsInputFocused,
    onImageClick: handleImageClick,
  };

  const layoutProps = {
    sidebarProps,
    chatAreaProps,
    footerRef,
    messagesContainerRef,
    contentRef,
    shouldShowScrollDownButton: showScrollDownButton && !isInputFocused && !isModelSelectorOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    setIsModelSelectorOpen,
    handleSend,
    handleLogout,
    scrollToBottom,
  };

  if (appState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-400">Загрузка ваших данных...</p>
        </div>
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center max-w-md px-4">
          <h2 className="text-xl font-semibold text-white mb-2">Ошибка загрузки</h2>
          <p className="text-gray-400 mb-6">{loadError}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
            Перезагрузить страницу
          </button>
        </div>
      </div>
    );
  }

  if (appState === 'ready') {
    return (
      <>
        {isDesktop ? <DesktopLayout {...layoutProps} /> : <MobileLayout {...layoutProps} />}
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={allImages}
          index={lightboxIndex}
        />
      </>
    );
  }

  return null;
}