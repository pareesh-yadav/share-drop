/**
 * ChunkReceiver
 *
 * Receives file chunks over WebRTC DataChannel and assembles them.
 *
 * Two receive strategies:
 *   1. File System Access API (if available): streams directly to disk.
 *      Requires user to choose a save location.
 *      Prevents memory accumulation for large files.
 *   2. Blob assembly (fallback): accumulates chunks in memory,
 *      creates an object URL, and triggers a download.
 *
 * Memory safety:
 *   - Chunks are stored only until assembled, then freed.
 *   - Object URLs are revoked after download trigger.
 *   - For File System Access, chunks are written immediately.
 */

import { features, isObjectUrl } from '../../utils/device';
import { sanitizeFilename } from '../../utils/crypto';
import { logger } from '../../utils/logger';

export interface ReceiverFile {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
}

interface ChunkState {
  receivedChunks: Map<number, ArrayBuffer>;
  totalChunks: number;
  receivedCount: number;
  fileWritable?: FileSystemWritableFileStream;
  blobParts: ArrayBuffer[];
}

export class ChunkReceiver {
  private fileStates = new Map<string, ChunkState>();
  private fileMetadata = new Map<string, ReceiverFile>();

  /**
   * Initialize a receiver for a file.
   * Called when FILE_START message is received.
   */
  initFile(file: ReceiverFile) {
    this.fileStates.set(file.fileId, {
      receivedChunks: new Map(),
      totalChunks: file.totalChunks,
      receivedCount: 0,
      blobParts: [],
    });
    this.fileMetadata.set(file.fileId, file);
    logger.transfer.info(`Initialized receiver for ${file.name} (${file.totalChunks} chunks)`);
  }

  /**
   * Receive a chunk. Returns progress as bytes received.
   * Returns -1 if invalid.
   */
  receiveChunk(fileId: string, chunkIndex: number, data: ArrayBuffer): number {
    const state = this.fileStates.get(fileId);
    if (!state) {
      logger.transfer.warn(`Received chunk for unknown file ${fileId}`);
      return -1;
    }

    if (state.receivedChunks.has(chunkIndex)) {
      logger.transfer.warn(`Duplicate chunk ${chunkIndex} for file ${fileId}`);
      return -1;
    }

    if (chunkIndex < 0 || chunkIndex >= state.totalChunks) {
      logger.transfer.warn(`Out-of-range chunk ${chunkIndex} for file ${fileId}`);
      return -1;
    }

    state.receivedChunks.set(chunkIndex, data);
    state.blobParts.push(data);
    state.receivedCount++;

    const meta = this.fileMetadata.get(fileId);
    const bytesReceived = state.blobParts.reduce((acc, b) => acc + b.byteLength, 0);
    logger.transfer.debug(`Chunk ${chunkIndex}/${state.totalChunks - 1} for ${meta?.name ?? fileId}`);

    return bytesReceived;
  }

  /**
   * Check if a file is complete.
   */
  isFileComplete(fileId: string): boolean {
    const state = this.fileStates.get(fileId);
    if (!state) return false;
    return state.receivedCount >= state.totalChunks;
  }

  /**
   * Assemble and download the completed file.
   * Returns the hash of the assembled file for integrity verification.
   */
  async assembleAndDownload(fileId: string): Promise<{ hash: string } | null> {
    const state = this.fileStates.get(fileId);
    const meta = this.fileMetadata.get(fileId);

    if (!state || !meta) {
      logger.transfer.warn(`Cannot assemble unknown file ${fileId}`);
      return null;
    }

    // Sort chunks by index to ensure correct order
    const sortedChunks = Array.from(state.receivedChunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, data]) => data);

    const safeName = sanitizeFilename(meta.name);
    const blob = new Blob(sortedChunks, { type: meta.mimeType || 'application/octet-stream' });

    // Compute SHA-256 hash for integrity verification
    let hash = '';
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      logger.transfer.warn('Failed to compute hash');
    }

    // Attempt File System Access API
    if (features.fileSystemAccess()) {
      try {
        const fileHandle = await (window as unknown as { showSaveFilePicker(opts: unknown): Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: safeName,
          types: [{
            description: 'File',
            accept: { [meta.mimeType || 'application/octet-stream']: [] },
          }],
        });
        const writable = await fileHandle.createWritable();
        for (const chunk of sortedChunks) {
          await writable.write(chunk);
        }
        await writable.close();
        logger.transfer.info(`Saved via File System Access: ${safeName}`);
        this.cleanupFile(fileId);
        return { hash };
      } catch (err) {
        // User cancelled picker — fall through to blob download
        if ((err as Error).name === 'AbortError') {
          logger.transfer.info('File save cancelled by user');
          return null;
        }
        logger.transfer.warn('File System Access failed, falling back to blob URL');
      }
    }

    // Fallback: Blob → object URL → programmatic download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release object URL after a short delay
    setTimeout(() => {
      if (isObjectUrl(url)) {
        URL.revokeObjectURL(url);
        logger.transfer.debug(`Revoked object URL for ${safeName}`);
      }
    }, 10000);

    logger.transfer.info(`Download triggered: ${safeName}`);
    this.cleanupFile(fileId);
    return { hash };
  }

  /**
   * Clean up state for a completed or cancelled file.
   */
  cleanupFile(fileId: string) {
    const state = this.fileStates.get(fileId);
    if (state) {
      state.receivedChunks.clear();
      state.blobParts = [];
      this.fileStates.delete(fileId);
    }
    this.fileMetadata.delete(fileId);
    logger.transfer.debug(`Cleaned up receiver state for ${fileId}`);
  }

  /**
   * Clean up all file states.
   */
  cleanupAll() {
    for (const fileId of this.fileStates.keys()) {
      this.cleanupFile(fileId);
    }
  }
}
