// 📄 src/services/db-manager.ts

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'AppCacheDB';
const DB_VERSION = 1;

const STORES = {
  conversations: 'conversations',
  messages: 'messages',
  settings: 'settings',
  prompts: 'prompts',
  imageMeta: 'imageMeta',
  keyValue: 'keyValue',
};

interface ImageMetadata {
  path: string;
  blob: Blob;
  size: number;
  timestamp: number;
}

const MAX_CACHE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_FILE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

class DBManager {
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase) {
        if (!db.objectStoreNames.contains(STORES.conversations)) {
          db.createObjectStore(STORES.conversations, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.messages)) {
          const messagesStore = db.createObjectStore(STORES.messages, { keyPath: 'id' });
          messagesStore.createIndex('conversation_id', 'conversation_id');
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains(STORES.prompts)) {
          db.createObjectStore(STORES.prompts, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.imageMeta)) {
          const imageMetaStore = db.createObjectStore(STORES.imageMeta, { keyPath: 'path' });
          imageMetaStore.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains(STORES.keyValue)) {
          db.createObjectStore(STORES.keyValue, { keyPath: 'key' });
        }
      },
    });
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> { return (await this.dbPromise).get(storeName, key); }
  async getAll<T>(storeName: string): Promise<T[]> { return (await this.dbPromise).getAll(storeName); }
  async getByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> { return (await this.dbPromise).getAllFromIndex(storeName, indexName, key); }
  async put<T>(storeName: string, value: T): Promise<IDBValidKey> { return (await this.dbPromise).put(storeName, value); }
  async bulkPut<T>(storeName: string, values: T[]): Promise<void> { if (values.length === 0) return; const db = await this.dbPromise; const tx = db.transaction(storeName, 'readwrite'); await Promise.all(values.map(value => tx.store.put(value))); await tx.done; }
  async delete(storeName: string, key: IDBValidKey): Promise<void> { return (await this.dbPromise).delete(storeName, key); }
  async bulkDelete(storeName: string, keys: IDBValidKey[]): Promise<void> { if (keys.length === 0) return; const db = await this.dbPromise; const tx = db.transaction(storeName, 'readwrite'); await Promise.all(keys.map(key => tx.store.delete(key))); await tx.done; }
  async clear(storeName: string): Promise<void> { return (await this.dbPromise).clear(storeName); }
  async getLastSyncTimestamp(key: string): Promise<string | null> { const result = await this.get<{ key: string; value: string }>(STORES.keyValue, key); return result?.value || null; }
  async setLastSyncTimestamp(key: string, timestamp: string): Promise<void> { await this.put(STORES.keyValue, { key, value: timestamp }); }

  // --- Image Cache Methods ---
  
  async getCachedImageBlob(path: string): Promise<Blob | null> {
    const metadata = await this.get<ImageMetadata>(STORES.imageMeta, path);
    if (metadata) {
      metadata.timestamp = Date.now();
      await this.put(STORES.imageMeta, metadata);
      return metadata.blob;
    }
    return null;
  }

  async cacheImage(path: string, signedUrl: string): Promise<Blob | null> {
    try {
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
      
      const blob = await response.blob();
      const metadata: ImageMetadata = {
        path,
        blob: blob,
        size: blob.size,
        timestamp: Date.now()
      };
      await this.put(STORES.imageMeta, metadata);
      this.cleanupImageCache();
      return blob;
    } catch (error) {
      console.error(`[DBManager] Failed to cache image for path ${path}:`, error);
      return null;
    }
  }

  async getCacheStats(): Promise<{ size: number; count: number }> {
    const allMetadata = await this.getAll<ImageMetadata>(STORES.imageMeta);
    const totalSize = allMetadata.reduce((sum, meta) => sum + meta.size, 0);
    return { size: totalSize, count: allMetadata.length };
  }

  async clearImageCache(): Promise<void> {
    await this.clear(STORES.imageMeta);
  }

  private async cleanupImageCache(): Promise<void> {
    const db = await this.dbPromise;
    let allMetadata = await this.getAll<ImageMetadata>(STORES.imageMeta);
    const now = Date.now();
    let totalSize = allMetadata.reduce((sum, meta) => sum + meta.size, 0);

    const expiredFiles = allMetadata.filter(meta => now - meta.timestamp > MAX_FILE_AGE_MS);
    if (expiredFiles.length > 0) {
      const tx = db.transaction(STORES.imageMeta, 'readwrite');
      for (const file of expiredFiles) {
        tx.store.delete(file.path);
      }
      await tx.done;
    }

    allMetadata = await this.getAll<ImageMetadata>(STORES.imageMeta);
    totalSize = allMetadata.reduce((sum, meta) => sum + meta.size, 0);

    if (totalSize > MAX_CACHE_SIZE_BYTES) {
      allMetadata.sort((a, b) => a.timestamp - b.timestamp);
      const tx = db.transaction(STORES.imageMeta, 'readwrite');
      let currentSize = totalSize;
      for (const file of allMetadata) {
        if (currentSize <= MAX_CACHE_SIZE_BYTES) break;
        tx.store.delete(file.path);
        currentSize -= file.size;
      }
      await tx.done;
    }
  }
}

class NoOpDBManager {
  async get(): Promise<any | undefined> { return undefined; }
  async getAll(): Promise<any[]> { return []; }
  async getByIndex(): Promise<any[]> { return []; }
  async put(): Promise<IDBValidKey> { return ''; }
  async bulkPut(): Promise<void> {}
  async delete(): Promise<void> {}
  async bulkDelete(): Promise<void> {}
  async clear(): Promise<void> {}
  async getLastSyncTimestamp(): Promise<string | null> { return null; }
  async setLastSyncTimestamp(): Promise<void> {}
  async getCachedImageBlob(): Promise<Blob | null> { return null; }
  async cacheImage(): Promise<Blob | null> { return null; }
  async getCacheStats(): Promise<{ size: number; count: number }> { return { size: 0, count: 0 }; }
  async clearImageCache(): Promise<void> {}
}

const dbManager = import.meta.env.SSR
  ? new NoOpDBManager()
  : new DBManager();

export { dbManager, STORES };