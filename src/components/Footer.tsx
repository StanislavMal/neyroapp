// 📄 src/components/Footer.tsx

import { useState, memo, forwardRef, useImperativeHandle, useRef } from 'react';
import { ChatInput } from './ChatInput';

interface FooterProps {
  onSend: (message: string, attachment?: File | null) => Promise<void>;
  isLoading: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  // ✅ НОВЫЙ ПРОП
  canAttachFiles: boolean;
}

export interface FooterRef {
  resetInput: () => void;
}

export const Footer = memo(forwardRef<FooterRef, FooterProps>(
  ({ onSend, isLoading, onFocus, onBlur, canAttachFiles }, ref) => {
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

    const handleSubmit = async (e: React.FormEvent, attachment?: File | null) => {
      e.preventDefault();
      const messageToSend = input.trim();
      if (!messageToSend && !attachment || isLoading) return;
      
      await onSend(messageToSend, attachment);
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
          // ✅ ПЕРЕДАЕМ ПРОП ДАЛЬШЕ
          canAttachFiles={canAttachFiles}
        />
      </footer>
    );
  }
));

Footer.displayName = 'Footer';