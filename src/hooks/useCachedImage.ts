// 📄 src/hooks/useCachedImage.ts

import { useState, useEffect } from 'react';
import { getDbManager, noOpDbManager } from '../services/db-manager';
import * as api from '../services/supabase';

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
        const signedUrls = await api.createSignedUrls([path]);
        if (!isMounted || signedUrls.length === 0) return;
        
        const signedUrl = signedUrls[0].signedUrl;

        const newBlob = await dbManager.cacheImage(path, signedUrl);
        if (isMounted && newBlob) {
          objectUrl = URL.createObjectURL(newBlob);
          setImageUrl(objectUrl);
        } else if (isMounted) {
          setImageUrl(signedUrl);
        }
      } catch (error) {
        console.error(`Failed to get signed URL for ${path}`, error);
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