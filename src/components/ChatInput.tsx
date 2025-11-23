// 📄 src/components/ChatInput.tsx

import { forwardRef, type Ref, useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: React.FormEvent, attachment?: File | null, blobUrl?: string) => Promise<void>;
  isLoading: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const ChatInput = forwardRef((
  { input, setInput, handleSubmit, isLoading, onFocus, onBlur }: ChatInputProps,
  ref: Ref<HTMLTextAreaElement>
) => {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentBlobUrl = useRef<string | null>(null);

  // Очистка URL при размонтировании компонента
  useEffect(() => {
    const blobUrl = currentBlobUrl.current;
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Аннулируем предыдущий URL, если он был
    if (currentBlobUrl.current) {
      URL.revokeObjectURL(currentBlobUrl.current);
    }

    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const newBlobUrl = URL.createObjectURL(file);
      setAttachment(file);
      setPreviewUrl(newBlobUrl);
      currentBlobUrl.current = newBlobUrl;
    } else {
      setAttachment(null);
      setPreviewUrl(null);
      currentBlobUrl.current = null;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    if (currentBlobUrl.current) {
      URL.revokeObjectURL(currentBlobUrl.current);
    }
    setAttachment(null);
    setPreviewUrl(null);
    currentBlobUrl.current = null;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !attachment) return;
    
    // Передаем URL, но не аннулируем его здесь
    handleSubmit(e, attachment, previewUrl || undefined);
    
    // Сбрасываем состояние, но не трогаем currentBlobUrl.current
    setAttachment(null);
    setPreviewUrl(null); 
    // `currentBlobUrl.current` будет очищен в `useChat`
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isDesktop && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit(e as any);
    }
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border-t border-orange-500/10 p-4">
      <form onSubmit={handleFormSubmit}>
        {previewUrl && (
          <div className="relative inline-block mb-2">
            <img src={previewUrl} alt="Preview" className="w-20 h-20 object-cover rounded-lg" />
            <button
              type="button"
              onClick={removeAttachment}
              className="absolute -top-2 -right-2 p-1 bg-gray-700 rounded-full text-white hover:bg-red-500"
              aria-label="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute p-2 text-gray-400 transition-colors left-2 hover:text-orange-400 focus:outline-none z-10"
            aria-label="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <textarea
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={t('chatInputPlaceholder')}
            className="w-full pl-10 pr-12 py-2.5 overflow-y-auto text-sm text-white placeholder-gray-400 border rounded-lg shadow-lg resize-none border-orange-500/20 bg-gray-800/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent max-h-[200px]"
            rows={1}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = (target.scrollHeight) + 'px'
            }}
          />
          <button
            type="submit"
            disabled={(!input.trim() && !attachment) || isLoading}
            className="absolute p-2 text-orange-500 transition-colors right-3 hover:text-orange-400 disabled:text-gray-500 focus:outline-none"
            aria-label={t('sendMessage') || 'Send message'}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';