// 📄 src/hooks/useCachedImage.ts

import { useState, useEffect } from 'react';
import { getDbManager, noOpDbManager } from '../services/db-manager';
import * as api from '../services/supabase';
import { retryAsync } from '../utils/retry';

export function useCachedImage(path: string | undefined, userId: string | null | undefined) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const dbManager = userId ? getDbManager(userId) : noOpDbManager;

    async function loadImage() {
      if (!path) {
        setImageUrl(null);
        return () => {};
      }

      const cachedBlob = await dbManager.getCachedImageBlob(path);
      
      if (isCancelled) return () => {};

      if (cachedBlob) {
        const objectUrl = URL.createObjectURL(cachedBlob);
        setImageUrl(objectUrl);
        
        return () => {
          URL.revokeObjectURL(objectUrl);
        };
      }
      
      try {
        const newBlob = await retryAsync(async () => {
          const signedUrls = await api.createSignedUrls([path]);
          if (signedUrls.length === 0 || !signedUrls[0]?.signedUrl) {
            throw new Error(`Could not get a signed URL for ${path}`);
          }
          const signedUrl = signedUrls[0].signedUrl;

          const cached = await dbManager.cacheImage(path, signedUrl);
          if (!cached) {
            throw new Error(`Failed to cache image blob for ${path}`);
          }
          return cached;
        }, { 
          maxAttempts: 3, 
          initialDelay: 1500,
          onRetry: (attempt, error) => {
            console.warn(`[useCachedImage] Retrying to fetch ${path} (attempt ${attempt}). Error:`, error.message);
          }
        });

        if (isCancelled) return () => {};

        if (newBlob) {
          const objectUrl = URL.createObjectURL(newBlob);
          setImageUrl(objectUrl);
          return () => {
            URL.revokeObjectURL(objectUrl);
          };
        }
      } catch (error) {
        console.error(`[useCachedImage] Failed to load image for ${path} after multiple retries:`, error);
        if (!isCancelled) setImageUrl(null);
      }
      
      return () => {};
    }

    let cleanup: (() => void) | null = null;
    
    loadImage().then(cleanupFn => {
      if (cleanupFn) {
        cleanup = cleanupFn;
      }
    });

    return () => {
      isCancelled = true;
      if (cleanup) {
        cleanup();
      }
      setImageUrl(null); 
    };
  }, [path, userId]);

  return imageUrl;
}