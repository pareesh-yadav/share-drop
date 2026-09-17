/**
 * ChunkSender
 *
 * Sends a single file over a WebRTC DataChannel using chunked transfer.
 *
 * Implements BACKPRESSURE:
 *   - Checks dataChannel.bufferedAmount before sending each chunk
 *   - If buffer is full, waits for bufferedamountlow event
 *   - Never loads the entire file into memory (uses File.slice())
 *
 * This design allows transferring arbitrarily large files without
 * running out of memory.
 */

import {
  CHUNK_SIZE,
  MAX_BUFFERED_AMOUNT,
  PROTOCOL_VERSION,
  SPEED_SAMPLE_WINDOW_MS,
} from '../../types';
import type { FileChunk, FileStart } from '../../types';
import { logger } from '../../utils/logger';
import type { WebRTCManager } from '../webrtc/WebRTCManager';

export interface ChunkSenderOptions {
  transferId: string;
  fileId: string;
  file: File;
  peerId: string;
  webrtcManager: WebRTCManager;
  onProgress: (bytesTransferred: number, speed: number, eta: number) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

interface SpeedSample {
  timestamp: number;
  bytes: number;
}

export class ChunkSender {
  private opts: ChunkSenderOptions;
  private cancelled = false;
  private bytesSent = 0;
  private speedSamples: SpeedSample[] = [];
  private startTime = 0;
  private resolveBackpressure: (() => void) | null = null;
  private cleanupBackpressure: (() => void) | null = null;

  constructor(opts: ChunkSenderOptions) {
    this.opts = opts;
  }

  async send(): Promise<void> {
    const { transferId, fileId, file, peerId, webrtcManager, onProgress, onComplete, onError } = this.opts;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    this.startTime = Date.now();

    // Send FILE_START metadata
    const startMsg: FileStart = {
      type: 'FILE_START',
      transferId,
      fileId,
      totalChunks,
      chunkSize: CHUNK_SIZE,
    };

    const sent = webrtcManager.send(peerId, JSON.stringify(startMsg));
    if (!sent) {
      onError('DataChannel not available');
      return;
    }

    // Set up backpressure callback
    this.cleanupBackpressure = webrtcManager.onBufferedAmountLow(peerId, () => {
      this.resolveBackpressure?.();
      this.resolveBackpressure = null;
    });

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (this.cancelled) {
          logger.transfer.info(`Transfer ${transferId} cancelled at chunk ${chunkIndex}`);
          return;
        }

        // Backpressure: wait if buffer is too full
        await this.waitForBuffer(peerId, webrtcManager);

        if (this.cancelled) return;

        // Read chunk from file without loading the whole file
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const slice = file.slice(start, end);
        const buffer = await slice.arrayBuffer();

        // Binary chunk header: [type:u8=0xFF][transferId:36b][fileId:36b][chunkIndex:u32]
        // We use a simple approach: send a header JSON then the binary data
        // But DataChannel messages are atomic, so we encode the metadata into
        // a structured binary format.
        const chunkData = encodeChunk(transferId, fileId, chunkIndex, buffer);

        if (!webrtcManager.send(peerId, chunkData)) {
          onError('Send failed — DataChannel closed');
          return;
        }

        this.bytesSent += buffer.byteLength;
        const { speed, eta } = this.calculateSpeed();
        onProgress(this.bytesSent, speed, eta);
      }

      // Send FILE_COMPLETE
      const completeMsg = {
        type: 'FILE_COMPLETE',
        transferId,
        fileId,
        receivedBytes: file.size,
      };
      webrtcManager.send(peerId, JSON.stringify(completeMsg));
      onComplete();

    } catch (err) {
      if (!this.cancelled) {
        onError(err instanceof Error ? err.message : 'Unknown send error');
      }
    } finally {
      this.cleanupBackpressure?.();
      this.cleanupBackpressure = null;
    }
  }

  private async waitForBuffer(peerId: string, webrtcManager: WebRTCManager): Promise<void> {
    const buffered = webrtcManager.getBufferedAmount(peerId);
    if (buffered < MAX_BUFFERED_AMOUNT) return;

    logger.transfer.debug(`Backpressure: waiting for buffer to drain (${buffered} bytes)`);

    // Wait for bufferedamountlow event
    await new Promise<void>((resolve) => {
      this.resolveBackpressure = resolve;
      // Safety timeout — if bufferedamountlow never fires, proceed after 5s
      const fallback = setTimeout(() => {
        this.resolveBackpressure = null;
        resolve();
      }, 5000);

      const originalResolve = resolve;
      this.resolveBackpressure = () => {
        clearTimeout(fallback);
        originalResolve();
      };
    });
  }

  private calculateSpeed(): { speed: number; eta: number } {
    const now = Date.now();
    this.speedSamples.push({ timestamp: now, bytes: this.bytesSent });

    // Keep only samples within the window
    const windowStart = now - SPEED_SAMPLE_WINDOW_MS;
    this.speedSamples = this.speedSamples.filter((s) => s.timestamp >= windowStart);

    if (this.speedSamples.length < 2) {
      return { speed: 0, eta: -1 };
    }

    const oldest = this.speedSamples[0];
    const newest = this.speedSamples[this.speedSamples.length - 1];
    const elapsed = (newest.timestamp - oldest.timestamp) / 1000; // seconds
    const transferred = newest.bytes - oldest.bytes;

    if (elapsed <= 0) return { speed: 0, eta: -1 };

    const speed = transferred / elapsed; // bytes/sec
    const remaining = this.opts.file.size - this.bytesSent;
    const eta = speed > 0 ? remaining / speed : -1;

    return { speed, eta };
  }

  cancel() {
    this.cancelled = true;
    this.resolveBackpressure?.();
    this.resolveBackpressure = null;
  }
}

// ─── Chunk Encoding ───────────────────────────────────────────────────────────

/**
 * Encode a file chunk as an ArrayBuffer.
 * Layout:
 *   [1 byte: 0xFF marker]
 *   [4 bytes: chunkIndex (uint32 BE)]
 *   [36 bytes: transferId (ASCII)]
 *   [36 bytes: fileId (ASCII)]
 *   [N bytes: file data]
 */
export function encodeChunk(
  transferId: string,
  fileId: string,
  chunkIndex: number,
  data: ArrayBuffer
): ArrayBuffer {
  const HEADER_SIZE = 1 + 4 + 36 + 36; // 77 bytes
  const total = new Uint8Array(HEADER_SIZE + data.byteLength);
  const view = new DataView(total.buffer);

  total[0] = 0xFF; // binary chunk marker
  view.setUint32(1, chunkIndex, false); // big-endian

  const enc = new TextEncoder();
  const tidBytes = enc.encode(transferId.replace(/-/g, '').slice(0, 36).padEnd(36, ' '));
  const fidBytes = enc.encode(fileId.replace(/-/g, '').slice(0, 36).padEnd(36, ' '));

  total.set(tidBytes.slice(0, 36), 5);
  total.set(fidBytes.slice(0, 36), 41);
  total.set(new Uint8Array(data), HEADER_SIZE);

  return total.buffer;
}

/**
 * Decode a chunk header from an ArrayBuffer.
 * Returns null if not a binary chunk.
 */
export interface ChunkHeader {
  transferId: string;
  fileId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

export function decodeChunk(buffer: ArrayBuffer): ChunkHeader | null {
  if (buffer.byteLength < 77) return null;
  const view = new DataView(buffer);

  if (view.getUint8(0) !== 0xFF) return null; // not a binary chunk

  const chunkIndex = view.getUint32(1, false);
  const dec = new TextDecoder();
  const transferId = dec.decode(buffer.slice(5, 41)).trim();
  const fileId = dec.decode(buffer.slice(41, 77)).trim();
  const data = buffer.slice(77);

  return { transferId, fileId, chunkIndex, data };
}
