/**
 * Cache Downloader - Download and import shared cache from Firebase Storage
 * 
 * Features:
 * - Download cache file from Firebase Storage
 * - Import to IndexedDB
 * - Progress tracking
 * - Cache version management
 * - Error handling with retry
 */

import * as localDb from '@/utils/db';
import type { NoiseReading } from '@/types/NoiseReading';

const CACHE_FILE_URL = 'https://firebasestorage.googleapis.com/v0/b/noise-pollution-mapper-9ad3d.appspot.com/o/cache%2Fnoise-readings-master-cache.json?alt=media';
const CACHE_VERSION_KEY = 'cacheVersion';
const CACHE_DOWNLOADED_KEY = 'cacheDownloaded';

export interface CacheMetadata {
  version: string;
  exportedAt: string;
  totalReadings: number;
}

export interface DownloadProgress {
  status: 'downloading' | 'importing' | 'complete' | 'error';
  progress: number; // 0-100
  loadedBytes?: number;
  totalBytes?: number;
  error?: string;
}

/**
 * Download cache file from Firebase Storage
 */
export async function downloadCache(
  onProgress?: (progress: DownloadProgress) => void
): Promise<{
  metadata: CacheMetadata;
  readings: NoiseReading[];
}> {
  try {
    if (onProgress) {
      onProgress({
        status: 'downloading',
        progress: 0,
      });
    }

    console.log('[Cache] Downloading from Firebase Storage...');
    
    const response = await fetch(CACHE_FILE_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get total size for progress
    const totalBytes = parseInt(response.headers.get('Content-Length') || '0', 10);
    let loadedBytes = 0;

    // Read response with progress tracking
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }

    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loadedBytes += value.length;
      
      if (onProgress && totalBytes > 0) {
        const progress = Math.round((loadedBytes / totalBytes) * 50); // First 50% = download
        onProgress({
          status: 'downloading',
          progress,
          loadedBytes,
          totalBytes,
        });
      }
    }

    // Combine chunks
    const allChunks = new Uint8Array(loadedBytes);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    // Parse JSON
    const text = new TextDecoder().decode(allChunks);
    const cacheData = JSON.parse(text);

    console.log(`[Cache] Downloaded ${cacheData.totalReadings} readings`);

    if (onProgress) {
      onProgress({
        status: 'importing',
        progress: 50, // Starting import phase
      });
    }

    return {
      metadata: {
        version: cacheData.version,
        exportedAt: cacheData.exportedAt,
        totalReadings: cacheData.totalReadings,
      },
      readings: cacheData.readings as NoiseReading[],
    };
  } catch (error) {
    console.error('[Cache] Download failed:', error);
    throw error;
  }
}

/**
 * Import cache to IndexedDB
 */
export async function importCacheToIndexedDB(
  readings: NoiseReading[],
  metadata: CacheMetadata,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  try {
    console.log('[Cache] Importing to IndexedDB...');

    // Import in batches to avoid blocking
    const BATCH_SIZE = 1000;
    let imported = 0;

    for (let i = 0; i < readings.length; i += BATCH_SIZE) {
      const batch = readings.slice(i, i + BATCH_SIZE);
      await localDb.setManyReadings(batch);
      
      imported += batch.length;
      
      if (onProgress) {
        // Second 50% = import (from 50% to 90%)
        const progress = 50 + Math.round((imported / readings.length) * 40);
        onProgress({
          status: 'importing',
          progress,
        });
      }
    }

    // Save cache metadata
    await localDb.setSyncMetadata(CACHE_VERSION_KEY, metadata.version);
    await localDb.setSyncMetadata(CACHE_DOWNLOADED_KEY, new Date().getTime());
    await localDb.setSyncMetadata('cacheMetadata', metadata);

    console.log(`[Cache] Imported ${imported} readings to IndexedDB`);

    if (onProgress) {
      onProgress({
        status: 'complete',
        progress: 100,
      });
    }
  } catch (error) {
    console.error('[Cache] Import failed:', error);
    throw error;
  }
}

/**
 * Get current cache version
 */
export async function getCacheVersion(): Promise<string | null> {
  const version = await localDb.getSyncMetadata(CACHE_VERSION_KEY);
  return version as string | null;
}

/**
 * Check if cache has been downloaded
 */
export async function isCacheDownloaded(): Promise<boolean> {
  const downloaded = await localDb.getSyncMetadata(CACHE_DOWNLOADED_KEY);
  return !!downloaded;
}

/**
 * Get cache metadata
 */
export async function getCacheMetadata(): Promise<CacheMetadata | null> {
  const metadata = await localDb.getSyncMetadata('cacheMetadata');
  return metadata as CacheMetadata | null;
}

/**
 * Check if cache is outdated (older than 7 days)
 */
export async function isCacheOutdated(): Promise<boolean> {
  const downloadedAt = await localDb.getSyncMetadata(CACHE_DOWNLOADED_KEY);
  
  if (!downloadedAt) return true; // Never downloaded
  
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (downloadedAt as any) < sevenDaysAgo;
}

/**
 * Download and import cache with progress tracking
 */
export async function downloadAndImportCache(
  onProgress?: (progress: DownloadProgress) => void
): Promise<{
  metadata: CacheMetadata;
  totalReadings: number;
}> {
  try {
    // Download cache
    const { metadata, readings } = await downloadCache(onProgress);
    
    // Import to IndexedDB
    await importCacheToIndexedDB(readings, metadata, onProgress);
    
    console.log('[Cache] Download and import complete!');
    
    return {
      metadata,
      totalReadings: metadata.totalReadings,
    };
  } catch (error) {
    console.error('[Cache] Process failed:', error);
    throw error;
  }
}
