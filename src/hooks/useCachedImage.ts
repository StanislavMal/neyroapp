// 📄 src/hooks/useCachedImage.ts

import { useState, useEffect } from 'react';
import { dbManager } from '../services/db-manager';

export function useCachedImage(path: string | undefined, signedUrl: string) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    async function loadImage() {
      if (!path) {
        setImageUrl(signedUrl);
        return;
      }

      // 1. Пытаемся получить Blob из кэша
      const cachedBlob = await dbManager.getCachedImageBlob(path);
      if (isMounted && cachedBlob) {
        objectUrl = URL.createObjectURL(cachedBlob);
        setImageUrl(objectUrl);
        return;
      }

      // 2. Если в кэше нет, скачиваем, кэшируем и получаем Blob
      const newBlob = await dbManager.cacheImage(path, signedUrl);
      if (isMounted && newBlob) {
        objectUrl = URL.createObjectURL(newBlob);
        setImageUrl(objectUrl);
      } else if (isMounted) {
        // Fallback на signedUrl в случае ошибки кэширования
        setImageUrl(signedUrl);
      }
    }

    loadImage();

    return () => {
      isMounted = false;
      // ✅ ВАЖНОЕ ИСПРАВЛЕНИЕ: Отзываем созданный URL при размонтировании компонента
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, signedUrl]);

  return imageUrl;
}