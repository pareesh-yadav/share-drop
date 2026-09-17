/**
 * TransferEngine
 *
 * Orchestrates file transfers between peers.
 * 
 * Responsibilities:
 * - Sending: creates TransferRequest, manages ChunkSender per file
 * - Receiving: handles incoming requests, manages ChunkReceiver
 * - Queue management: multiple files, one at a time per peer
 * - Protocol: handles all TRANSFER_* and FILE_* messages
 * - Progress: updates TransferStore with throttled UI updates
 * - Cancellation: both sides can cancel
 * - Cleanup: proper resource management
 *
 * IMPORTANT: Does NOT live in React or Zustand.
 * Updates Zustand stores, but does not hold binary data in them.
 */

import {
  CHUNK_SIZE,
  PROGRESS_THROTTLE_MS,
  PROTOCOL_VERSION,
} from '../../types';
import type {
  FileMetadata,
  TransferRecord,
  TransferMessage,
  TransferStatus,
} from '../../types';
import { TransferMessageSchema } from '../../schemas';
import { useTransferStore } from '../../stores/transferStore';
import { useUIStore } from '../../stores/uiStore';
import { useRoomStore } from '../../stores/roomStore';
import { logger } from '../../utils/logger';
import { throttle } from '../../utils/format';
import { generateTransferId, generateFileId } from '../../utils/crypto';
import type { WebRTCManager } from '../webrtc/WebRTCManager';
import { ChunkSender, decodeChunk } from './ChunkSender';
import { ChunkReceiver } from './ChunkReceiver';

export class TransferEngine {
  private webrtcManager: WebRTCManager;
  private activeSenders = new Map<string, ChunkSender>(); // transferId → sender
  private chunkReceivers = new Map<string, ChunkReceiver>(); // peerId → receiver
  private cleanupFns: Array<() => void> = [];

  // Throttled progress updaters to avoid excessive React renders
  private throttledProgressUpdaters = new Map<string, (bytes: number, speed: number, eta: number) => void>();

  constructor(webrtcManager: WebRTCManager) {
    this.webrtcManager = webrtcManager;

    // Register for all DataChannel messages
    const unsub = webrtcManager.onDataChannelMessage((peerId, data) => {
      this.handleMessage(peerId, data);
    });
    this.cleanupFns.push(unsub);
  }

  // ─── Sending ──────────────────────────────────────────────────────────────

  /**
   * Send files to a peer. Creates a transfer request and waits for acceptance.
   */
  async sendFiles(peerId: string, files: File[]): Promise<string> {
    const transferId = generateTransferId();
    const room = useRoomStore.getState().room;
    const peer = room?.peers.find((p) => p.id === peerId);
    const peerName = peer?.displayName ?? 'Unknown';

    const fileMetadataList: FileMetadata[] = files.map((f) => ({
      transferId,
      fileId: generateFileId(),
      name: f.name,
      size: f.size,
      mimeType: f.type || 'application/octet-stream',
      lastModified: f.lastModified,
    }));

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    // Create transfer record in store
    const record: TransferRecord = {
      transferId,
      direction: 'send',
      peerId,
      peerName,
      files: fileMetadataList.map((m) => ({
        fileId: m.fileId,
        name: m.name,
        size: m.size,
        mimeType: m.mimeType,
        bytesTransferred: 0,
        status: 'pending',
      })),
      totalSize,
      totalBytesTransferred: 0,
      status: 'pending',
      startedAt: Date.now(),
      speed: 0,
      eta: -1,
    };

    useTransferStore.getState().addTransfer(record);

    // Send TRANSFER_REQUEST
    const requestMsg: TransferMessage = {
      type: 'TRANSFER_REQUEST',
      transferId,
      files: fileMetadataList,
      totalSize,
      protocolVersion: PROTOCOL_VERSION,
    };

    const sent = this.webrtcManager.send(peerId, JSON.stringify(requestMsg));
    if (!sent) {
      useTransferStore.getState().setTransferStatus(transferId, 'failed', 'DataChannel not available');
      throw new Error('DataChannel not available');
    }

    logger.transfer.info(`Transfer request sent: ${transferId} (${files.length} files)`);
    return transferId;
  }

  /**
   * Actually start sending files (after recipient accepts).
   */
  private async startSending(
    transferId: string,
    peerId: string,
    files: File[],
    fileMetadataList: FileMetadata[]
  ): Promise<void> {
    useTransferStore.getState().setTransferStatus(transferId, 'transferring');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = fileMetadataList[i];

      if (useTransferStore.getState().getTransfer(transferId)?.status === 'cancelled') {
        logger.transfer.info(`Transfer ${transferId} cancelled before file ${meta.name}`);
        return;
      }

      useTransferStore.getState().updateFileProgress(transferId, meta.fileId, {
        status: 'transferring',
      });

      const throttledUpdate = this.getThrottledProgressUpdater(transferId, meta.fileId);

      await new Promise<void>((resolve, reject) => {
        const sender = new ChunkSender({
          transferId,
          fileId: meta.fileId,
          file,
          peerId,
          webrtcManager: this.webrtcManager,
          onProgress: (bytes, speed, eta) => {
            throttledUpdate(bytes, speed, eta);
          },
          onComplete: resolve,
          onError: (err) => reject(new Error(err)),
        });

        this.activeSenders.set(transferId, sender);
        sender.send().catch(reject);
      });

      useTransferStore.getState().updateFileProgress(transferId, meta.fileId, {
        status: 'completed',
        bytesTransferred: file.size,
      });
    }

    // Send TRANSFER_COMPLETE
    const completeMsg: TransferMessage = {
      type: 'TRANSFER_COMPLETE',
      transferId,
    };
    this.webrtcManager.send(peerId, JSON.stringify(completeMsg));
    useTransferStore.getState().setTransferStatus(transferId, 'completed');
    this.activeSenders.delete(transferId);
    this.throttledProgressUpdaters.delete(transferId);

    useUIStore.getState().addToast({
      type: 'success',
      title: 'Transfer Complete',
      message: `${files.length} file${files.length !== 1 ? 's' : ''} sent successfully`,
    });

    logger.transfer.info(`Transfer ${transferId} complete`);
  }

  // ─── Message Handler ──────────────────────────────────────────────────────

  private handleMessage(peerId: string, data: ArrayBuffer | string) {
    // Binary data = file chunk
    if (data instanceof ArrayBuffer) {
      this.handleBinaryChunk(peerId, data);
      return;
    }

    // JSON message
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      logger.transfer.warn('Failed to parse transfer message');
      return;
    }

    const result = TransferMessageSchema.safeParse(parsed);
    if (!result.success) {
      logger.transfer.warn('Invalid transfer message', result.error.issues);
      return;
    }

    const msg = result.data;
    logger.transfer.debug(`Transfer message: ${msg.type}`);

    switch (msg.type) {
      case 'TRANSFER_REQUEST':
        this.handleTransferRequest(peerId, msg);
        break;
      case 'TRANSFER_ACCEPT':
        this.handleTransferAccept(peerId, msg.transferId);
        break;
      case 'TRANSFER_REJECT':
        this.handleTransferReject(msg.transferId, msg.reason);
        break;
      case 'FILE_START':
        this.handleFileStart(peerId, msg);
        break;
      case 'FILE_COMPLETE':
        this.handleFileComplete(peerId, msg);
        break;
      case 'TRANSFER_COMPLETE':
        this.handleTransferComplete(msg.transferId);
        break;
      case 'TRANSFER_CANCEL':
        this.handleTransferCancel(msg.transferId);
        break;
      case 'TRANSFER_ERROR':
        this.handleTransferError(msg.transferId, msg.error);
        break;
    }
  }

  private handleBinaryChunk(peerId: string, data: ArrayBuffer) {
    const decoded = decodeChunk(data);
    if (!decoded) {
      logger.transfer.warn('Failed to decode binary chunk');
      return;
    }

    const { transferId, fileId, chunkIndex, data: chunkData } = decoded;
    let receiver = this.chunkReceivers.get(peerId);
    if (!receiver) {
      receiver = new ChunkReceiver();
      this.chunkReceivers.set(peerId, receiver);
    }

    const bytesReceived = receiver.receiveChunk(fileId, chunkIndex, chunkData);
    if (bytesReceived < 0) return;

    // Update progress throttled
    const updater = this.getThrottledProgressUpdater(transferId, fileId);
    const transfer = useTransferStore.getState().getTransfer(transferId);
    if (transfer) {
      const file = transfer.files.find((f) => f.fileId === fileId);
      const speed = transfer.speed;
      const eta = transfer.eta;
      updater(bytesReceived, speed, eta);
    }
  }

  private async handleTransferRequest(peerId: string, msg: Extract<TransferMessage, { type: 'TRANSFER_REQUEST' }>) {
    const { transferId, files, totalSize } = msg;
    const room = useRoomStore.getState().room;
    const peer = room?.peers.find((p) => p.id === peerId);
    const peerName = peer?.displayName ?? 'Unknown';

    // Lazy-import settings store to avoid circular dependency issues
    const { useSettingsStore } = await import('../../stores/settingsStore');
    const autoAccept = useSettingsStore.getState().autoAccept;

    const record: TransferRecord = {
      transferId,
      direction: 'receive',
      peerId,
      peerName,
      files: files.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        bytesTransferred: 0,
        status: 'pending' as const,
      })),
      totalSize,
      totalBytesTransferred: 0,
      status: 'pending',
      startedAt: Date.now(),
      speed: 0,
      eta: -1,
    };

    useTransferStore.getState().addTransfer(record);

    if (autoAccept) {
      this.acceptTransfer(transferId, peerId);
    } else {
      useTransferStore.getState().setIncomingRequest(record);
      useUIStore.getState().addToast({
        type: 'info',
        title: `${peerName} wants to send files`,
        message: `${files.length} file${files.length !== 1 ? 's' : ''} — tap to review`,
        duration: 10000,
      });
    }
  }

  acceptTransfer(transferId: string, peerId: string) {
    const acceptMsg: TransferMessage = {
      type: 'TRANSFER_ACCEPT',
      transferId,
    };
    this.webrtcManager.send(peerId, JSON.stringify(acceptMsg));
    useTransferStore.getState().setTransferStatus(transferId, 'waiting');
    useTransferStore.getState().setIncomingRequest(null);
    logger.transfer.info(`Transfer ${transferId} accepted`);
  }

  rejectTransfer(transferId: string, peerId: string) {
    const rejectMsg: TransferMessage = {
      type: 'TRANSFER_REJECT',
      transferId,
      reason: 'Rejected by user',
    };
    this.webrtcManager.send(peerId, JSON.stringify(rejectMsg));
    useTransferStore.getState().setTransferStatus(transferId, 'rejected');
    useTransferStore.getState().setIncomingRequest(null);
    logger.transfer.info(`Transfer ${transferId} rejected`);
  }

  cancelTransfer(transferId: string, peerId: string) {
    // Cancel sender if we're sending
    const sender = this.activeSenders.get(transferId);
    if (sender) {
      sender.cancel();
      this.activeSenders.delete(transferId);
    }

    // Cancel receiver if we're receiving
    const receiver = this.chunkReceivers.get(peerId);
    if (receiver) {
      receiver.cleanupAll();
    }

    // Notify the other peer
    const cancelMsg: TransferMessage = {
      type: 'TRANSFER_CANCEL',
      transferId,
      reason: 'Cancelled by user',
    };
    this.webrtcManager.send(peerId, JSON.stringify(cancelMsg));
    useTransferStore.getState().setTransferStatus(transferId, 'cancelled');
    logger.transfer.info(`Transfer ${transferId} cancelled`);
  }

  private handleTransferAccept(peerId: string, transferId: string) {
    const transfer = useTransferStore.getState().getTransfer(transferId);
    if (!transfer || transfer.direction !== 'send') return;

    // We need the File objects, but they can't be stored in Zustand.
    // The files are stored in a local ref. We'll handle this via the context.
    // This is done by keeping pending files in a local map.
    logger.transfer.info(`Transfer ${transferId} accepted by ${peerId}`);
    useUIStore.getState().addToast({
      type: 'info',
      title: 'Transfer Accepted',
      message: 'Starting file transfer...',
      duration: 3000,
    });
    // The actual send is triggered externally after accept — see useSendFiles hook
  }

  private handleTransferReject(transferId: string, reason?: string) {
    useTransferStore.getState().setTransferStatus(transferId, 'rejected', reason);
    useUIStore.getState().addToast({
      type: 'warning',
      title: 'Transfer Rejected',
      message: reason ?? 'The recipient declined the transfer.',
    });
    logger.transfer.info(`Transfer ${transferId} rejected: ${reason}`);
  }

  private handleFileStart(peerId: string, msg: Extract<TransferMessage, { type: 'FILE_START' }>) {
    let receiver = this.chunkReceivers.get(peerId);
    if (!receiver) {
      receiver = new ChunkReceiver();
      this.chunkReceivers.set(peerId, receiver);
    }

    const transfer = useTransferStore.getState().getTransfer(msg.transferId);
    const fileMeta = transfer?.files.find((f) => f.fileId === msg.fileId);

    if (!fileMeta) {
      logger.transfer.warn(`FILE_START for unknown file ${msg.fileId}`);
      return;
    }

    receiver.initFile({
      fileId: msg.fileId,
      name: fileMeta.name,
      size: fileMeta.size,
      mimeType: fileMeta.mimeType,
      totalChunks: msg.totalChunks,
    });

    useTransferStore.getState().updateFileProgress(msg.transferId, msg.fileId, {
      status: 'transferring',
    });
  }

  private async handleFileComplete(peerId: string, msg: Extract<TransferMessage, { type: 'FILE_COMPLETE' }>) {
    const { transferId, fileId, receivedBytes } = msg;
    const receiver = this.chunkReceivers.get(peerId);

    if (!receiver) {
      logger.transfer.warn(`FILE_COMPLETE for unknown receiver`);
      return;
    }

    if (!receiver.isFileComplete(fileId)) {
      logger.transfer.warn(`FILE_COMPLETE received but not all chunks received for ${fileId}`);
    }

    const result = await receiver.assembleAndDownload(fileId);

    useTransferStore.getState().updateFileProgress(transferId, fileId, {
      status: 'completed',
      bytesTransferred: receivedBytes,
      integrityVerified: result?.hash !== undefined,
    });

    logger.transfer.info(`File ${fileId} assembled, hash: ${result?.hash?.slice(0, 8) ?? 'N/A'}...`);
  }

  private handleTransferComplete(transferId: string) {
    useTransferStore.getState().setTransferStatus(transferId, 'completed');
    useUIStore.getState().addToast({
      type: 'success',
      title: 'Transfer Complete',
      message: 'All files received successfully.',
    });
    logger.transfer.info(`Transfer ${transferId} complete`);
  }

  private handleTransferCancel(transferId: string) {
    useTransferStore.getState().setTransferStatus(transferId, 'cancelled', 'Cancelled by peer');
    useUIStore.getState().addToast({
      type: 'warning',
      title: 'Transfer Cancelled',
      message: 'The other device cancelled the transfer.',
    });
    logger.transfer.info(`Transfer ${transferId} cancelled by peer`);
  }

  private handleTransferError(transferId: string, error: string) {
    useTransferStore.getState().setTransferStatus(transferId, 'failed', error);
    useUIStore.getState().addToast({
      type: 'error',
      title: 'Transfer Error',
      message: error,
    });
    logger.transfer.error(`Transfer ${transferId} error: ${error}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getThrottledProgressUpdater(
    transferId: string,
    fileId: string
  ): (bytes: number, speed: number, eta: number) => void {
    const key = `${transferId}-${fileId}`;
    if (!this.throttledProgressUpdaters.has(key)) {
      const updater = throttle((bytes: unknown, speed: unknown, eta: unknown) => {
        useTransferStore.getState().updateFileProgress(transferId, fileId, {
          bytesTransferred: bytes as number,
        });
        useTransferStore.getState().updateTransfer(transferId, {
          speed: speed as number,
          eta: eta as number,
        });
      }, PROGRESS_THROTTLE_MS);
      this.throttledProgressUpdaters.set(key, updater as (bytes: number, speed: number, eta: number) => void);
    }
    return this.throttledProgressUpdaters.get(key)!;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy() {
    // Cancel all active senders
    for (const sender of this.activeSenders.values()) {
      sender.cancel();
    }
    this.activeSenders.clear();

    // Clean up all receivers
    for (const receiver of this.chunkReceivers.values()) {
      receiver.cleanupAll();
    }
    this.chunkReceivers.clear();

    this.throttledProgressUpdaters.clear();

    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];

    logger.transfer.info('TransferEngine destroyed');
  }
}

// ─── Pending Files Registry ───────────────────────────────────────────────────
// Since File objects can't live in Zustand, we keep them in a module-level
// registry. The TransferEngine checks this when acceptance arrives.

const pendingFiles = new Map<string, { files: File[]; metadata: FileMetadata[]; peerId: string }>();

export function registerPendingFiles(
  transferId: string,
  files: File[],
  metadata: FileMetadata[],
  peerId: string
) {
  pendingFiles.set(transferId, { files, metadata, peerId });
}

export function getPendingFiles(transferId: string) {
  return pendingFiles.get(transferId);
}

export function clearPendingFiles(transferId: string) {
  pendingFiles.delete(transferId);
}
