// 📄 src/hooks/useSidebar.ts

import { useState, useCallback } from 'react';
import { useConversations } from '../store/hooks';

export function useSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    updateConversationTitle,
    deleteConversation,
    duplicateConversation,
  } = useConversations();

  const handleNewChat = useCallback(() => {
    setCurrentConversationId(null);
    setIsOpen(false);
  }, [setCurrentConversationId]);

  const handleSelectChat = useCallback((id: string) => {
    setCurrentConversationId(id);
    setIsOpen(false);
  }, [setCurrentConversationId]);

  const handleDeleteChat = useCallback(async (id: string) => {
    await deleteConversation(id);
  }, [deleteConversation]);

  const handleDuplicateChat = useCallback(async (id: string) => {
    await duplicateConversation(id);
  }, [duplicateConversation]);

  const handleStartEdit = useCallback((id: string, currentTitle: string) => {
    setEditingChatId(id);
    setEditingTitle(currentTitle);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingChatId && editingTitle.trim()) {
      await updateConversationTitle(editingChatId, editingTitle.trim());
    }
    setEditingChatId(null);
    setEditingTitle('');
  }, [editingChatId, editingTitle, updateConversationTitle]);

  const handleCancelEdit = useCallback(() => {
    setEditingChatId(null);
    setEditingTitle('');
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const toggleCollapse = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
  }, []);

  return {
    // State
    isOpen,
    isCollapsed,
    editingChatId,
    editingTitle,
    conversations,
    currentConversationId,
    
    // Actions
    setIsOpen,
    setEditingTitle,
    toggleSidebar,
    toggleCollapse,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleDuplicateChat,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
  };
}
