// 📄 src/components/ChatArea.tsx

import { memo, useCallback, forwardRef, type ForwardedRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatMessage, LoadingIndicator, WelcomeScreen } from '../components';
import type { Message } from '../lib/ai/types';

interface ChatAreaProps {
  messages: Message[];
  pendingMessage: Message | null;
  isThinking: boolean;
  error: string | null;
  currentConversationId: string | null;
  editingMessageId: string | null;
  
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, content: string) => void;
}

const ChatAreaComponent = memo(
  ({
    messages,
    pendingMessage,
    isThinking,
    error,
    currentConversationId,
    editingMessageId,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
  }: ChatAreaProps) => {
    const { t } = useTranslation();

    const handleMessageActions = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button[data-action]');
      if (!button) return;

      const messageDiv = target.closest('[data-message-id]');
      const messageId = messageDiv?.getAttribute('data-message-id');
      if (!messageId) return;

      const action = button.getAttribute('data-action');
      if (action === 'start-edit') onStartEdit(messageId);
    }, [onStartEdit]);

    const handleRegenerate = useCallback((assistantMessageId: string) => {
      const assistantIndex = messages.findIndex(m => m.id === assistantMessageId);
      if (assistantIndex === -1) return;
      
      for (let i = assistantIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          onSaveEdit(messages[i].id, messages[i].content);
          break;
        }
      }
    }, [messages, onSaveEdit]);

    return (
      <div className="w-full h-full p-4" onClick={handleMessageActions}>
        {error && (
          <div className="bg-red-500/10 border-l-4 border-red-500 text-red-300 p-4 mb-4 rounded-r-lg" role="alert">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
              <div>
                <p className="font-bold">{t('errorOccurred')}</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {currentConversationId ? (
            <>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isEditing={editingMessageId === message.id}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  showRegenerateButton={message.role === 'assistant'}
                  onRegenerate={() => handleRegenerate(message.id)}
                  isLoading={isThinking}
                  isStreaming={false} 
                />
              ))}
              
              {pendingMessage && (
                <ChatMessage
                  message={pendingMessage}
                  isEditing={false}
                  onSaveEdit={() => {}}
                  onCancelEdit={() => {}}
                  isStreaming={true}
                />
              )}
              
              {isThinking && !pendingMessage && <LoadingIndicator />}
            </>
          ) : (
            <WelcomeScreen />
          )}
        </div>
      </div>
    );
  },
  (prev, next) => (
    prev.messages === next.messages &&
    prev.pendingMessage?.content === next.pendingMessage?.content &&
    prev.isThinking === next.isThinking &&
    prev.error === next.error &&
    prev.currentConversationId === next.currentConversationId &&
    prev.editingMessageId === next.editingMessageId
  )
);

ChatAreaComponent.displayName = 'ChatArea';

export const ChatArea = forwardRef((props: ChatAreaProps, ref: ForwardedRef<HTMLDivElement>) => (
  <div ref={ref} className="w-full">
    <ChatAreaComponent {...props} />
  </div>
));