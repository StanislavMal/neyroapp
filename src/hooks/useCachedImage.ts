// 📄 src/hooks/useCachedImage.ts

import { useState, useEffect } from 'react';
import { getDbManager, noOpDbManager } from '../services/db-manager';
import * as api from '../services/supabase';
import { retryAsync } from '../utils/retry';

export function useCachedImage(path: string | undefined, userId: string | null | undefined) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    const dbManager = userId ? getDbManager(userId) : noOpDbManager;

    async function loadImage() {
      if (!path) {
        setImageUrl(null);
        return;
      }

      const cachedBlob = await dbManager.getCachedImageBlob(path);
      if (isMounted && cachedBlob) {
        objectUrl = URL.createObjectURL(cachedBlob);
        setImageUrl(objectUrl);
        return;
      }

      if (!isMounted) return;

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

        if (isMounted && newBlob) {
          objectUrl = URL.createObjectURL(newBlob);
          setImageUrl(objectUrl);
        }
      } catch (error) {
        console.error(`[useCachedImage] Failed to load image for ${path} after multiple retries:`, error);
        if (isMounted) setImageUrl(null);
      }
    }

    loadImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, userId]);

  return imageUrl;
}