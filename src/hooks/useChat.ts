// 📄 src/hooks/useChat.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import { streamChat } from '../lib/ai/server';
import type { Message, Attachment, MessageContent } from '../lib/ai/types';
import { useConversations, useSettings, usePrompts } from '../store/hooks';
import { selectors, store } from '../store/store';
import { useAuth } from '../providers/AuthProvider';
import * as api from '../services/supabase';
import { compressImage } from '../utils/image-compression';
import { MODELS } from '../components/ModelSelector';
import { getDbManager } from '../services/db-manager';

const toBase64 = (data: File | Blob): Promise<{ mimeType: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(data);
    reader.onload = () => {
      const result = reader.result as string;
      const [header, dataPart] = result.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || data.type;
      resolve({ mimeType, data: dataPart });
    };
    reader.onerror = (error) => reject(error);
  });
};

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
    updateMessage,
    createNewConversation,
    editMessageAndUpdate 
  } = useConversations();

  const currentModel = MODELS.find(m => m.id === settings?.model);
  const supportsVision = currentModel?.supportsVision ?? false;

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
    async (messageHistoryForAI: { role: 'user' | 'assistant' | 'system', content: MessageContent }[]) => {
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
            messages: messageHistoryForAI,
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

  const prepareHistoryForAI = useCallback(async (messages: Message[], supportsVision: boolean): Promise<{ role: 'user' | 'assistant', content: MessageContent }[]> => {
    if (!user) return [];
    const dbManager = getDbManager(user.id);
    const historyForAI: { role: 'user' | 'assistant', content: MessageContent }[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (supportsVision && msg.attachments && msg.attachments.length > 0) {
        const contentParts: ({ type: 'text', text: string } | { type: 'image_url', image_url: { url: string } })[] = [];
        
        if (msg.content) {
          contentParts.push({ type: 'text', text: msg.content });
        }

        for (const attachment of msg.attachments) {
          if (attachment.type !== 'image' || !attachment.path) continue;
          
          try {
            // ✅ ИЗМЕНЕНИЕ: Полагаемся только на локальный кэш.
            const imageBlob = await dbManager.getImageBlobReadOnly(attachment.path);
            
            if (imageBlob) {
              const { mimeType, data } = await toBase64(imageBlob);
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${data}` },
              });
            } else {
              // Логируем ошибку, но не прерываем процесс.
              console.error(`[prepareHistoryForAI] CRITICAL: Blob for ${attachment.path} not found in local cache during regeneration.`);
            }
          } catch (e) {
            console.error(`[prepareHistoryForAI] Error processing attachment ${attachment.path}:`, e);
          }
        }
        historyForAI.push({ role: msg.role, content: contentParts });
      } else {
        historyForAI.push({ role: msg.role, content: msg.content });
      }
    }
    return historyForAI;
  }, [user]);

  const sendMessage = useCallback(
    async (content: string, files?: File[] | null) => {
      const hasContent = content.trim();
      const hasAttachments = files && files.length > 0;

      if ((!hasContent && !hasAttachments) || isLoading || !user) {
        return;
      }

      if (hasAttachments && !supportsVision) {
        setError("The selected model does not support image attachments.");
        return;
      }

      setIsLoading(true);
      setError(null);
      setPendingMessage(null);
      
      let convId = currentConversationId;
      const tempBlobUrls: string[] = [];

      try {
        if (!convId) {
          const title = content.slice(0, 30) || "Image Message";
          convId = await createNewConversation(title);
          if (!convId) throw new Error('Failed to create conversation');
        }

        const tempMessageId = crypto.randomUUID();
        
        const tempAttachmentsForUI: Attachment[] = hasAttachments ? files.map(file => {
            const blobUrl = URL.createObjectURL(file);
            tempBlobUrls.push(blobUrl);
            return {
                type: 'image',
                url: blobUrl,
                path: '',
                isLoading: true,
            };
        }) : [];
        
        const messageForUI: Message = { 
          id: tempMessageId, 
          role: 'user', 
          content: content.trim(),
          attachments: tempAttachmentsForUI,
        };
        const messageForDB: Message = {
          id: tempMessageId, 
          role: 'user', 
          content: content.trim(),
        };
        
        await addMessage(convId, messageForUI, messageForDB);
        
        const compressedFiles = hasAttachments 
          ? await Promise.all(files.map(file => compressImage(file)))
          : [];

        const uploadTask = async (): Promise<Attachment[]> => {
          if (!hasAttachments) return [];
          const uploadPromises = compressedFiles.map(compressedFile => 
            api.uploadAttachment(user.id, compressedFile)
          );
          const filePaths = await Promise.all(uploadPromises);
          const signedUrls = await api.createSignedUrls(filePaths);
          if (signedUrls.length > 0) {
            return signedUrls.map(item => ({ type: 'image', path: item.path, url: item.signedUrl, isLoading: false }));
          }
          throw new Error("Не удалось получить URL для загруженных файлов.");
        };

        const aiTask = async () => {
          const previousMessages = selectors.getCurrentMessages(store.state).filter(m => m.id !== tempMessageId);
          const historyForAI = await prepareHistoryForAI(previousMessages, supportsVision);
          const userMessageContentForAI: MessageContent = [];
          if (hasContent) userMessageContentForAI.push({ type: 'text', text: content.trim() });
          if (hasAttachments) {
            for (const compressedFile of compressedFiles) {
              const { mimeType, data } = await toBase64(compressedFile);
              userMessageContentForAI.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } });
            }
          }
          historyForAI.push({ role: 'user', content: userMessageContentForAI });
          return processAIResponse(historyForAI);
        };
        
        const [finalAttachments, aiResponse] = await Promise.all([uploadTask(), aiTask()]);

        if (finalAttachments.length > 0) {
          await updateMessage(convId, tempMessageId, { attachments: finalAttachments });
          await api.updateMessageAttachments(tempMessageId, finalAttachments);
        }
        
        setPendingMessage(null);
        if (aiResponse && aiResponse.content.trim()) {
          const aiMessage: Message = { ...aiResponse };
          await addMessage(convId, aiMessage, aiMessage);
          options.onResponseComplete?.(aiMessage);
        }

      } catch (error) {
        console.error("Error in sendMessage:", error);
        const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
        setError(errorMsg);
      } finally {
        if (!pendingMessage) {
            setIsLoading(false);
        }
        tempBlobUrls.forEach(url => URL.revokeObjectURL(url));
      }
    },
    [user, isLoading, currentConversationId, createNewConversation, addMessage, updateMessage, processAIResponse, options, supportsVision, prepareHistoryForAI]
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

        const messageHistoryForAI = await prepareHistoryForAI(updatedHistory, supportsVision);

        const aiResponse = await processAIResponse(messageHistoryForAI);
        setPendingMessage(null);
        if (aiResponse && aiResponse.content.trim()) {
          const aiMessage: Message = { ...aiResponse };
          await addMessage(currentConversationId, aiMessage, aiMessage);
          options.onResponseComplete?.(aiMessage);
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
    [isLoading, currentConversationId, editMessageAndUpdate, addMessage, processAIResponse, options, supportsVision, prepareHistoryForAI]
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