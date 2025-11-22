// 📄 src/hooks/useChat.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import { streamChat } from '../lib/ai/server';
import type { Message, Attachment, ImageAttachmentPayload } from '../lib/ai/types';
import { useConversations, useSettings, usePrompts } from '../store/hooks';
import { selectors, store } from '../store/store';
import { useAuth } from '../providers/AuthProvider';
import * as api from '../services/supabase';

// Утилита для конвертации файла в Base64 строку
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Возвращаем только саму base64 строку, без префикса 'data:mime/type;base64,'
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });

interface UseChatOptions {
  onResponseStart?: () => void;
  onResponseComplete?: (message: Message) => void;
  onError?: (error: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  
  const { settings } = useSettings();
  const { activePrompt } = usePrompts();
  const { 
    currentConversationId, 
    addMessage, 
    createNewConversation,
    editMessageAndUpdate 
  } = useConversations();

  const textQueueRef = useRef<string>('');
  const displayedTextRef = useRef<string>('');
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const bufferRef = useRef<string>('');
  const activeRequestIdRef = useRef<string | null>(null);
  const isStreamActiveRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    };
  }, []);

  const startTypingAnimation = useCallback(() => {
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    const streamSpeed = settings?.streamSpeed || 30;
    const updateIntervalMs = 33;
    const charsPerTick = Math.max(1, Math.round((streamSpeed * updateIntervalMs) / 1000));
    intervalIdRef.current = setInterval(() => {
      if (textQueueRef.current.length > 0) {
        const charsToAdd = textQueueRef.current.substring(0, charsPerTick);
        textQueueRef.current = textQueueRef.current.substring(charsPerTick);
        displayedTextRef.current += charsToAdd;
        setPendingMessage(prev => prev ? { ...prev, content: displayedTextRef.current } : prev);
      } else if (!isStreamActiveRef.current) {
        if (intervalIdRef.current) clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    }, updateIntervalMs);
  }, [settings?.streamSpeed]);

  const stopTypingAnimation = useCallback(() => {
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    intervalIdRef.current = null;
    isStreamActiveRef.current = false;
  }, []);

  const parseNDJSON = useCallback((data: string) => {
    bufferRef.current += data;
    const lines = bufferRef.current.split('\n');
    bufferRef.current = lines.pop() || '';
    const chunks = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        chunks.push(JSON.parse(line));
      } catch (e) {
        console.warn('[useChat] Failed to parse NDJSON line:', line);
      }
    }
    return chunks;
  }, []);

  const processAIResponse = useCallback(
    async (textMessageHistory: { role: 'user' | 'assistant' | 'system', content: string }[], attachmentsPayload?: ImageAttachmentPayload[]) => {
      if (!settings) {
        const errorMsg = "User settings not loaded.";
        setError(errorMsg);
        options.onError?.(errorMsg);
        return null;
      }

      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      bufferRef.current = '';
      textQueueRef.current = '';
      displayedTextRef.current = '';
      setPendingMessage(null);
      stopTypingAnimation();
      
      try {
        const provider = settings.model.startsWith('deepseek') ? 'deepseek' : 'gemini';
        const response = await streamChat({
          data: {
            messages: textMessageHistory,
            attachments: attachmentsPayload,
            provider,
            model: settings.model,
            systemInstruction: settings.system_instruction,
            activePromptContent: activePrompt?.content,
            temperature: settings.temperature,
            reasoningEffort: settings.reasoningEffort,
          },
        });

        if (activeRequestIdRef.current !== requestId || !response.body) return null;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let animationStarted = false;
        while (true) {
          if (activeRequestIdRef.current !== requestId) {
            reader.cancel();
            return null;
          }
          const { value, done } = await reader.read();
          if (done) {
            isStreamActiveRef.current = false;
            break;
          }
          const rawText = decoder.decode(value, { stream: true });
          const chunks = parseNDJSON(rawText);
          for (const chunk of chunks) {
            if (chunk.type === 'heartbeat') continue;
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.text) {
              if (!animationStarted) {
                setPendingMessage({ id: 'pending-assistant-message', role: 'assistant', content: '' });
                isStreamActiveRef.current = true;
                startTypingAnimation();
                setIsLoading(false);
                options.onResponseStart?.();
                animationStarted = true;
              }
              textQueueRef.current += chunk.text;
            }
          }
        }
        await new Promise<void>((resolve) => {
          const checkCompletion = () => {
            if (textQueueRef.current.length === 0 && !intervalIdRef.current) resolve();
            else setTimeout(checkCompletion, 50);
          };
          checkCompletion();
        });
        return { id: crypto.randomUUID(), role: 'assistant' as const, content: displayedTextRef.current };
      } catch (error) {
        if (activeRequestIdRef.current !== requestId) return null;
        const errorMsg = error instanceof Error ? error.message : 'An error occurred';
        setError(errorMsg);
        options.onError?.(errorMsg);
        return null;
      } finally {
        stopTypingAnimation();
      }
    },
    [settings, activePrompt, startTypingAnimation, stopTypingAnimation, options, parseNDJSON]
  );
  
  const sendMessage = useCallback(
    async (content: string, attachmentFile?: File | null, conversationTitle?: string) => {
      if ((!content.trim() && !attachmentFile) || isLoading || !user) return;

      setIsLoading(true);
      setError(null);
      setPendingMessage(null);
      
      let attachmentsForUI: Attachment[] = [];
      let attachmentsForAI: ImageAttachmentPayload[] = [];
      
      try {
        if (attachmentFile) {
          const [filePath, base64Data] = await Promise.all([
            api.uploadAttachment(user.id, attachmentFile),
            fileToBase64(attachmentFile),
          ]);

          const signedUrls = await api.createSignedUrls([filePath]);
          if (signedUrls.length > 0) {
            attachmentsForUI.push({
              type: 'image',
              path: filePath,
              url: signedUrls[0].signedUrl,
            });
            attachmentsForAI.push({
              type: 'image',
              mimeType: attachmentFile.type,
              data: base64Data,
            });
          } else {
            throw new Error("Не удалось получить URL для загруженного файла.");
          }
        }

        const userMessage: Message = { 
          id: crypto.randomUUID(), 
          role: 'user', 
          content: content.trim(),
          attachments: attachmentsForUI,
        };

        let convId = currentConversationId;
        if (!convId) {
          const title = conversationTitle || content.slice(0, 30) || "Image Message";
          convId = await createNewConversation(title);
          if (!convId) throw new Error('Failed to create conversation');
        }
        
        await addMessage(convId, userMessage);
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const currentMessages = selectors.getCurrentMessages(store.state);
        
        const textMessageHistory = currentMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

        const aiResponse = await processAIResponse(textMessageHistory, attachmentsForAI);
        
        setPendingMessage(null);
        if (aiResponse && aiResponse.content.trim()) {
          await addMessage(convId, aiResponse);
          options.onResponseComplete?.(aiResponse);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
        setError(errorMsg);
        options.onError?.(errorMsg);
        setPendingMessage(null);
      } finally {
        setIsLoading(false);
      }
    },
    [user, isLoading, currentConversationId, createNewConversation, addMessage, processAIResponse, options]
  );

  const editAndRegenerate = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentConversationId || isLoading) return;
      setIsLoading(true);
      setError(null);
      setPendingMessage(null);
      try {
        const updatedHistory = await editMessageAndUpdate(messageId, newContent);
        if (!updatedHistory) throw new Error("Failed to update message");
        const messageHistoryForAI = updatedHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));
        const aiResponse = await processAIResponse(messageHistoryForAI);
        setPendingMessage(null);
        if (aiResponse && aiResponse.content.trim()) {
          await addMessage(currentConversationId, aiResponse);
          options.onResponseComplete?.(aiResponse);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'An error occurred during edit';
        setError(errorMsg);
        options.onError?.(errorMsg);
        setPendingMessage(null);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, currentConversationId, editMessageAndUpdate, addMessage, processAIResponse, options]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    sendMessage,
    editAndRegenerate,
    isLoading,
    error,
    clearError,
    pendingMessage,
  };
}