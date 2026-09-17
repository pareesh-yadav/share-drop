/**
 * SignalingManager
 *
 * Orchestrates the SignalingTransport lifecycle:
 * - Connects and reconnects
 * - Routes messages to WebRTCManager
 * - Updates Zustand stores
 * - Handles room lifecycle (create, join, expire)
 *
 * NOTE: This is NOT a React component. It is a plain class used by
 * useSignaling hook and mounted once per session.
 */

import type { SignalingTransport } from './SignalingTransport';
import type { SignalingMessage } from '../../types';
import { useRoomStore } from '../../stores/roomStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUIStore } from '../../stores/uiStore';
import { logger } from '../../utils/logger';
import { detectDeviceType } from '../../utils/device';

type OnSignalForWebRTC = (msg: SignalingMessage, fromPeerId: string) => void;

export class SignalingManager {
  private transport: SignalingTransport;
  private webrtcCallback: OnSignalForWebRTC | null = null;
  private cleanupFns: Array<() => void> = [];

  constructor(transport: SignalingTransport) {
    this.transport = transport;
  }

  /**
   * Register a callback that will be called with offer/answer/ice messages.
   * Used by WebRTCManager to handle WebRTC signaling.
   */
  setWebRTCCallback(cb: OnSignalForWebRTC) {
    this.webrtcCallback = cb;
  }

  async connect(): Promise<void> {
    await this.transport.connect();

    const unsubSignal = this.transport.onSignal((msg) => this.handleSignal(msg));
    const unsubDisconnect = this.transport.onDisconnect(() => {
      logger.signaling.warn('Transport disconnected');
      useConnectionStore.getState().clearAll();
    });
    const unsubError = this.transport.onError((err) => {
      logger.signaling.error('Transport error', err.message);
      useUIStore.getState().addToast({
        type: 'error',
        title: 'Connection Error',
        message: err.message,
      });
    });

    this.cleanupFns.push(unsubSignal, unsubDisconnect, unsubError);
  }

  async createRoom(displayName: string): Promise<{ roomId: string; myPeerId: string }> {
    const deviceType = detectDeviceType();
    const { room, myPeerId } = await this.transport.createRoom(displayName, deviceType);

    useRoomStore.getState().setRoom(room, myPeerId);
    logger.room.info(`Room created: ${room.id}`);

    this.scheduleExpiryCheck(room.expiresAt);

    return { roomId: room.id, myPeerId };
  }

  async joinRoom(
    roomId: string,
    displayName: string
  ): Promise<{ roomId: string; myPeerId: string }> {
    const deviceType = detectDeviceType();
    const { room, myPeerId } = await this.transport.joinRoom(roomId, displayName, deviceType);

    useRoomStore.getState().setRoom(room, myPeerId);
    logger.room.info(`Room joined: ${room.id}`);

    this.scheduleExpiryCheck(room.expiresAt);

    return { roomId: room.id, myPeerId };
  }

  sendSignal(msg: SignalingMessage): void {
    this.transport.sendSignal(msg);
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  private handleSignal(msg: SignalingMessage) {
    logger.signaling.debug(`Signal received: ${msg.type}`, { from: msg.fromPeerId });

    switch (msg.type) {
      case 'peer:joined': {
        useRoomStore.getState().addPeer(msg.peer);
        useUIStore.getState().addToast({
          type: 'info',
          title: `${msg.peer.displayName} joined`,
          duration: 3000,
        });
        break;
      }

      case 'peer:left': {
        useRoomStore.getState().removePeer(msg.peerId);
        useConnectionStore.getState().removeConnection(msg.peerId);
        useUIStore.getState().addToast({
          type: 'warning',
          title: `A device disconnected`,
          duration: 3000,
        });
        break;
      }

      case 'room:expired': {
        useRoomStore.getState().expireRoom();
        useUIStore.getState().addToast({
          type: 'warning',
          title: 'Room expired',
          message: 'This room has expired.',
        });
        break;
      }

      case 'error': {
        logger.signaling.error(`Server error: ${msg.code} - ${msg.message}`);
        useUIStore.getState().addToast({
          type: 'error',
          title: `Server Error: ${msg.code}`,
          message: msg.message,
        });
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice:candidate': {
        // Delegate to WebRTC manager
        this.webrtcCallback?.(msg, msg.fromPeerId);
        break;
      }

      default:
        break;
    }
  }

  private scheduleExpiryCheck(expiresAt: number) {
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      useRoomStore.getState().expireRoom();
      return;
    }
    const timer = setTimeout(() => {
      useRoomStore.getState().expireRoom();
    }, delay);
    this.cleanupFns.push(() => clearTimeout(timer));
  }

  destroy(): void {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.transport.disconnect();
  }
}
