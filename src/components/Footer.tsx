// 📄 src/components/Footer.tsx

import { useState, memo, forwardRef, useImperativeHandle, useRef } from 'react';
import { ChatInput } from './ChatInput';

interface FooterProps {
  // ✅ ИЗМЕНЕНИЕ: onSend теперь принимает blobUrl
  onSend: (message: string, attachment?: File | null, blobUrl?: string) => Promise<void>;
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
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      resetInput: () => {
        setInput('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }));

    // ✅ ИЗМЕНЕНИЕ: handleSubmit теперь принимает и передает blobUrl
    const handleSubmit = async (e: React.FormEvent, attachment?: File | null, blobUrl?: string) => {
      e.preventDefault();
      const messageToSend = input.trim();
      if (!messageToSend && !attachment || isLoading) return;
      
      await onSend(messageToSend, attachment, blobUrl);
    };

    return (
      <footer className="w-full max-w-5xl mx-auto">
        <ChatInput 
          ref={textareaRef}
          input={input}
          setInput={setInput}
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