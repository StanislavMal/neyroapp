// 📄 src/components/Footer.tsx

import { useState, memo, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { ChatInput, type FileWithThumbnail } from './ChatInput';
import { compressImage } from '../utils/image-compression';

interface FooterProps {
  onSend: (message: string, attachments?: File[]) => Promise<void>;
  isLoading: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface FooterRef {
  resetInput: () => void;
}

export const Footer = memo(forwardRef<FooterRef, FooterProps>(
  ({ onSend, isLoading, onFocus, onBlur }, ref) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<FileWithThumbnail[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const currentBlobUrls = useRef<string[]>([]);

    const clearAllAttachments = useCallback(() => {
      currentBlobUrls.current.forEach(url => URL.revokeObjectURL(url));
      currentBlobUrls.current = [];
      setAttachments([]);
    }, []);
    
    const resetInputState = useCallback(() => {
      setInput('');
      clearAllAttachments();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, [clearAllAttachments]);

    useImperativeHandle(ref, () => ({
      resetInput: resetInputState
    }));

    const handleFileChange = async (files: FileList | null) => {
      if (!files) return;
      const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      const newAttachments: FileWithThumbnail[] = [];
      for (const file of imageFiles) {
        try {
          const thumbnail = await compressImage(file, { maxSizeMB: 0.2, maxWidthOrHeight: 400, initialQuality: 0.6 });
          const thumbnailUrl = URL.createObjectURL(thumbnail);
          currentBlobUrls.current.push(thumbnailUrl);
          newAttachments.push({ originalFile: file, thumbnailUrl });
        } catch (error) {
          console.error("Failed to create thumbnail for", file.name, error);
        }
      }
      setAttachments(prev => [...prev, ...newAttachments]);
    };

    const handleRemoveAttachment = useCallback((indexToRemove: number) => {
      const urlToRemove = attachments[indexToRemove]?.thumbnailUrl;
      if (urlToRemove) {
        URL.revokeObjectURL(urlToRemove);
        const urlIndexInRef = currentBlobUrls.current.indexOf(urlToRemove);
        if (urlIndexInRef > -1) currentBlobUrls.current.splice(urlIndexInRef, 1);
      }
      setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
    }, [attachments]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const messageToSend = input.trim();
      if ((!messageToSend && attachments.length === 0) || isLoading) return;
      
      const filesToSend = attachments.map(att => att.originalFile);
      onSend(messageToSend, filesToSend);
      
      resetInputState();
    };

    return (
      <footer className="w-full max-w-5xl mx-auto">
        <ChatInput 
          ref={textareaRef}
          input={input}
          setInput={setInput}
          attachments={attachments}
          onFileChange={handleFileChange}
          onRemoveAttachment={handleRemoveAttachment}
          onClearAttachments={clearAllAttachments}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </footer>
    );
  }
));

Footer.displayName = 'Footer';