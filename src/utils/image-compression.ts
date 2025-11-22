// 📄 src/utils/image-compression.ts

import imageCompression from 'browser-image-compression';

interface CompressionOptions {
  /** Максимальный размер файла в мегабайтах. Изображения больше этого размера будут сжаты. */
  maxSizeMB?: number;
  /** Максимальная ширина или высота изображения. */
  maxWidthOrHeight?: number;
  /** Использовать ли Web Worker для сжатия (рекомендуется для производительности). */
  useWebWorker?: boolean;
  /** Качество изображения для форматов JPEG/WEBP (от 0 до 1). */
  initialQuality?: number;
}

const defaultOptions: Required<CompressionOptions> = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.7,
};

/**
 * Сжимает изображение в браузере перед загрузкой.
 * @param file Исходный файл изображения.
 * @param options Параметры сжатия.
 * @returns Сжатый файл (или исходный, если сжатие не требуется).
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const finalOptions = { ...defaultOptions, ...options };

  // Проверяем, нужно ли вообще сжимать изображение
  if (file.size / 1024 / 1024 < finalOptions.maxSizeMB) {
    console.log('[ImageCompression] Изображение меньше лимита, сжатие не требуется.');
    return file;
  }
  
  console.log(`[ImageCompression] Начало сжатия. Исходный размер: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

  try {
    const compressedFile = await imageCompression(file, finalOptions);
    console.log(`[ImageCompression] Сжатие завершено. Новый размер: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
    return compressedFile;
  } catch (error) {
    console.error('[ImageCompression] Ошибка при сжатии изображения, будет использован исходный файл.', error);
    return file; // В случае ошибки возвращаем исходный файл
  }
}