// 📄 src/components/ChatInput.tsx

import { forwardRef, type Ref, useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSettings } from '../store/hooks';
import { MODELS } from './ModelSelector';
import { compressImage } from '../utils/image-compression';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: React.FormEvent, attachments?: FileWithThumbnail[] | null) => void;
  isLoading: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}
export interface FileWithThumbnail {
  originalFile: File;
  thumbnailUrl: string;
}

export const ChatInput = forwardRef((
  { input, setInput, handleSubmit, isLoading, onFocus, onBlur }: ChatInputProps,
  ref: Ref<HTMLTextAreaElement>
) => {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  const { settings } = useSettings();
  const currentModel = MODELS.find(m => m.id === settings?.model);
  const supportsVision = currentModel?.supportsVision ?? false;

  const [attachments, setAttachments] = useState<FileWithThumbnail[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentBlobUrls = useRef<string[]>([]);

  const removeAttachment = useCallback((indexToRemove: number) => {
    const urlToRemove = attachments[indexToRemove]?.thumbnailUrl;
    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove);
      const urlIndexInRef = currentBlobUrls.current.indexOf(urlToRemove);
      if (urlIndexInRef > -1) {
        currentBlobUrls.current.splice(urlIndexInRef, 1);
      }
    }
    setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  }, [attachments]);

  const clearAllAttachments = useCallback(() => {
    currentBlobUrls.current.forEach(url => URL.revokeObjectURL(url));
    currentBlobUrls.current = [];
    setAttachments([]);
  }, []);

  useEffect(() => {
    if (!supportsVision && attachments.length > 0) {
      clearAllAttachments();
    }
  }, [supportsVision, attachments, clearAllAttachments]);

  useEffect(() => {
    const blobUrls = currentBlobUrls.current;
    return () => {
      blobUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const newAttachments: FileWithThumbnail[] = [];

    for (const file of imageFiles) {
      try {
        const thumbnail = await compressImage(file, {
          maxSizeMB: 0.2,
          maxWidthOrHeight: 400, // 400px
          initialQuality: 0.6,
        });
        const thumbnailUrl = URL.createObjectURL(thumbnail);
        currentBlobUrls.current.push(thumbnailUrl);
        newAttachments.push({ originalFile: file, thumbnailUrl });
      } catch (error) {
        console.error("Failed to create thumbnail for", file.name, error);
      }
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    
    handleSubmit(e, attachments);
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
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, index) => (
              <div key={att.thumbnailUrl} className="relative inline-block">
                <img src={att.thumbnailUrl} alt={`Preview ${index + 1}`} className="w-20 h-20 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute -top-2 -right-2 p-1 bg-gray-700 rounded-full text-white hover:bg-red-500"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative flex items-center">
          <div className="group absolute left-2 z-10">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!supportsVision}
              className="p-2 text-gray-400 transition-colors hover:text-orange-400 focus:outline-none disabled:text-gray-600 disabled:cursor-not-allowed"
              aria-label="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            {!supportsVision && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {t('visionNotSupported')}
              </div>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
            multiple
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
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
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