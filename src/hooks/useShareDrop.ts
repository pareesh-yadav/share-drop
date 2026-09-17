/**
 * useShareDrop
 *
 * Main application hook that wires together:
 * - SignalingManager (transport)
 * - WebRTCManager (peer connections)
 * - TransferEngine (file transfers)
 *
 * This hook is mounted ONCE at the application level.
 * Services are stored in refs, never in React state.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { WebSocketSignalingTransport } from '../services/signaling/WebSocketSignalingTransport';
import { LocalSignalingTransport } from '../services/signaling/LocalSignalingTransport';
import { SignalingManager } from '../services/signaling/SignalingManager';
import { WebRTCManager } from '../services/webrtc/WebRTCManager';
import { TransferEngine, registerPendingFiles, clearPendingFiles } from '../services/transfer/TransferEngine';

import { useRoomStore } from '../stores/roomStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useTransferStore } from '../stores/transferStore';
import { features } from '../utils/device';
import { logger } from '../utils/logger';
import type { FileMetadata } from '../types';
import { generateFileId, generateTransferId } from '../utils/crypto';
import { PROTOCOL_VERSION } from '../types';

function createTransport(): SignalingManager {
  const isLocalHost = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const configuredUrl = import.meta.env.VITE_SIGNALING_URL as string | undefined;

  // Auto-connect to current host in production (e.g. Railway) if no explicit URL is passed
  const autoUrl = typeof window !== 'undefined' && !isLocalHost
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : '';

  const activeUrl = configuredUrl || autoUrl;

  const forceLocal = import.meta.env.VITE_USE_LOCAL_SIGNALING === 'true';

  if (forceLocal || (!activeUrl && isLocalHost)) {
    if (!features.broadcastChannel()) {
      throw new Error('BroadcastChannel not supported. Set VITE_SIGNALING_URL for production.');
    }
    logger.app.warn('⚠️ Using LocalSignalingTransport (BroadcastChannel). Development mode only.');
    return new SignalingManager(new LocalSignalingTransport());
  }

  logger.app.info(`Using WebSocketSignalingTransport: ${activeUrl}`);
  return new SignalingManager(new WebSocketSignalingTransport(activeUrl));
}

export function useShareDrop() {
  const signalingRef = useRef<SignalingManager | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const transferRef = useRef<TransferEngine | null>(null);
  // Map of transferId → { files, metadata } for pending sends
  const pendingSendFiles = useRef<Map<string, { files: File[]; metadata: FileMetadata[]; peerId: string }>>(new Map());

  const navigate = useNavigate();

  // Initialize services once
  useEffect(() => {
    try {
      if (!features.webRTC()) {
        useUIStore.getState().addToast({
          type: 'error',
          title: 'WebRTC Not Supported',
          message: 'Your browser does not support WebRTC. Please use Chrome, Edge, Firefox, or Safari.',
          duration: 15000,
        });
        return;
      }

      const signalingManager = createTransport();
      const webrtcManager = new WebRTCManager(signalingManager);
      const transferEngine = new TransferEngine(webrtcManager);

      signalingRef.current = signalingManager;
      webrtcRef.current = webrtcManager;
      transferRef.current = transferEngine;

      logger.app.info('ShareDrop services initialized');
    } catch (err) {
      logger.app.error('Failed to initialize services', err);
      useUIStore.getState().addToast({
        type: 'error',
        title: 'Initialization Error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    return () => {
      transferRef.current?.destroy();
      webrtcRef.current?.destroy();
      signalingRef.current?.destroy();
      transferRef.current = null;
      webrtcRef.current = null;
      signalingRef.current = null;
      logger.app.info('ShareDrop services destroyed');
    };
  }, []);

  // ─── Room Actions ──────────────────────────────────────────────────────────

  const createRoom = useCallback(async () => {
    const { displayName } = useSettingsStore.getState();
    const signalingManager = signalingRef.current;
    if (!signalingManager) return null;

    try {
      if (!signalingManager.isConnected()) {
        await signalingManager.connect();
      }
      const { roomId, myPeerId } = await signalingManager.createRoom(displayName);
      webrtcRef.current?.setIdentity(myPeerId, roomId);
      navigate(`/room/${roomId}`);
      return roomId;
    } catch (err) {
      logger.app.error('Failed to create room', err);
      useUIStore.getState().addToast({
        type: 'error',
        title: 'Failed to create room',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      return null;
    }
  }, [navigate]);

  const joinRoom = useCallback(async (roomId: string) => {
    const { displayName } = useSettingsStore.getState();
    const signalingManager = signalingRef.current;
    if (!signalingManager) return false;

    try {
      if (!signalingManager.isConnected()) {
        await signalingManager.connect();
      }
      const { myPeerId } = await signalingManager.joinRoom(roomId, displayName);
      webrtcRef.current?.setIdentity(myPeerId, roomId);

      // Initiate WebRTC connections to all existing peers
      const { room } = useRoomStore.getState();
      if (room) {
        for (const peer of room.peers) {
          if (peer.id !== myPeerId) {
            await webrtcRef.current?.connectToPeer(peer.id);
          }
        }
      }

      navigate(`/room/${roomId}`);
      return true;
    } catch (err) {
      logger.app.error('Failed to join room', err);
      useUIStore.getState().addToast({
        type: 'error',
        title: 'Failed to join room',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    }
  }, [navigate]);

  const leaveRoom = useCallback(() => {
    const { activeTransfers } = useTransferStore.getState();
    const active = activeTransfers();

    if (active.length > 0) {
      useUIStore.getState().setLeaveDialog(true, () => {
        doLeave();
      });
    } else {
      doLeave();
    }

    function doLeave() {
      webrtcRef.current?.destroy();
      signalingRef.current?.destroy();

      // Re-initialize for next use
      try {
        const signalingManager = createTransport();
        const webrtcManager = new WebRTCManager(signalingManager);
        const transferEngine = new TransferEngine(webrtcManager);
        signalingRef.current = signalingManager;
        webrtcRef.current = webrtcManager;
        transferRef.current = transferEngine;
      } catch { /* handled */ }

      useRoomStore.getState().clearRoom();
      navigate('/');
    }
  }, [navigate]);

  // ─── Transfer Actions ──────────────────────────────────────────────────────

  const sendFiles = useCallback(async (peerId: string, files: File[]) => {
    const engine = transferRef.current;
    if (!engine) return;

    const transferId = generateTransferId();
    const metadata: FileMetadata[] = files.map((f) => ({
      transferId,
      fileId: generateFileId(),
      name: f.name,
      size: f.size,
      mimeType: f.type || 'application/octet-stream',
      lastModified: f.lastModified,
    }));

    registerPendingFiles(transferId, files, metadata, peerId);
    pendingSendFiles.current.set(transferId, { files, metadata, peerId });

    await engine.sendFiles(peerId, files);
  }, []);

  const acceptTransfer = useCallback((transferId: string, peerId: string) => {
    transferRef.current?.acceptTransfer(transferId, peerId);
  }, []);

  const rejectTransfer = useCallback((transferId: string, peerId: string) => {
    transferRef.current?.rejectTransfer(transferId, peerId);
  }, []);

  const cancelTransfer = useCallback((transferId: string, peerId: string) => {
    transferRef.current?.cancelTransfer(transferId, peerId);
    clearPendingFiles(transferId);
  }, []);

  // ─── Connect to new peer ───────────────────────────────────────────────────

  const connectToPeer = useCallback(async (peerId: string) => {
    await webrtcRef.current?.connectToPeer(peerId);
  }, []);

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    sendFiles,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    connectToPeer,
    isLocalMode: !import.meta.env.VITE_SIGNALING_URL,
  };
}
