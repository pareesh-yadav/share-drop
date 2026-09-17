/**
 * WebSocketSignalingTransport
 *
 * Connects to any WebSocket signaling server at VITE_SIGNALING_URL.
 * The server is responsible for:
 *   - Creating rooms (ephemeral, auto-expire)
 *   - Joining rooms
 *   - Routing signaling messages between peers
 *
 * Protocol: JSON messages over WebSocket.
 * All messages are validated with Zod before being dispatched.
 *
 * SERVER CONTRACT:
 *   Client → Server: { action: 'create-room', payload: { displayName, deviceType } }
 *   Client → Server: { action: 'join-room', payload: { roomId, displayName, deviceType } }
 *   Client → Server: { action: 'signal', payload: <SignalingMessage> }
 *   Server → Client: <SignalingMessage> (room:created | room:joined | peer:joined | peer:left | offer | answer | ice:candidate | room:expired | error)
 */

import { MAX_SIGNALING_PAYLOAD_BYTES, PROTOCOL_VERSION } from '../../types';
import type { Room, SignalingMessage } from '../../types';
import { SignalingMessageSchema } from '../../schemas';
import { logger } from '../../utils/logger';
import type { SignalingTransport, SignalCallback, DisconnectCallback, ErrorCallback } from './SignalingTransport';
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_ATTEMPTS,
  CONNECTION_TIMEOUT_MS,
} from '../../types';

interface WsEnvelope {
  action: string;
  payload: unknown;
}

export class WebSocketSignalingTransport implements SignalingTransport {
  private url: string;
  private ws: WebSocket | null = null;
  private signalCallbacks: Set<SignalCallback> = new Set();
  private disconnectCallbacks: Set<DisconnectCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private intentionalDisconnect = false;

  // Pending promises for room create/join
  private pendingRoom: {
    resolve: (v: { room: Room; myPeerId: string }) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = 'arraybuffer';

        const timeout = setTimeout(() => {
          this.ws?.close();
          reject(new Error('WebSocket connection timed out'));
        }, CONNECTION_TIMEOUT_MS);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          logger.signaling.info('WebSocket connected', { url: this.url });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string);
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          logger.signaling.warn('WebSocket closed', { code: event.code, reason: event.reason });
          if (!this.intentionalDisconnect) {
            this.scheduleReconnect();
            this.disconnectCallbacks.forEach((cb) => cb());
          }
        };

        this.ws.onerror = () => {
          this.connected = false;
          const err = new Error('WebSocket error');
          logger.signaling.error('WebSocket error');
          this.errorCallbacks.forEach((cb) => cb(err));
          if (!this.connected) {
            clearTimeout(timeout);
            reject(err);
          }
        };
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private handleMessage(raw: string) {
    // Reject oversized messages
    if (raw.length > MAX_SIGNALING_PAYLOAD_BYTES * 2) {
      logger.signaling.warn('Rejected oversized message', { size: raw.length });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.signaling.warn('Failed to parse signaling message');
      return;
    }

    const result = SignalingMessageSchema.safeParse(parsed);
    if (!result.success) {
      logger.signaling.warn('Invalid signaling message', { errors: result.error.issues });
      return;
    }

    const msg = result.data as SignalingMessage;
    logger.signaling.debug(`Received: ${msg.type}`);

    // Handle room creation/join responses
    if ((msg.type === 'room:created' || msg.type === 'room:joined') && this.pendingRoom) {
      clearTimeout(this.pendingRoom.timer);
      this.pendingRoom.resolve({ room: msg.room, myPeerId: msg.myPeerId });
      this.pendingRoom = null;
    }

    // Dispatch to all signal callbacks
    this.signalCallbacks.forEach((cb) => cb(msg));
  }

  async createRoom(displayName: string, deviceType: string): Promise<{ room: Room; myPeerId: string }> {
    return this.sendRoomAction('create-room', { displayName, deviceType });
  }

  async joinRoom(
    roomId: string,
    displayName: string,
    deviceType: string
  ): Promise<{ room: Room; myPeerId: string }> {
    return this.sendRoomAction('join-room', { roomId, displayName, deviceType });
  }

  private sendRoomAction(
    action: string,
    payload: Record<string, unknown>
  ): Promise<{ room: Room; myPeerId: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not connected'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRoom = null;
        reject(new Error(`Timed out waiting for ${action} response`));
      }, CONNECTION_TIMEOUT_MS);

      this.pendingRoom = { resolve, reject, timer };
      this.send({ action, payload: { ...payload, protocolVersion: PROTOCOL_VERSION } });
    });
  }

  sendSignal(msg: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.signaling.warn('Cannot send signal: not connected');
      return;
    }
    logger.signaling.debug(`Sending: ${msg.type}`);
    this.send({ action: 'signal', payload: msg });
  }

  private send(envelope: WsEnvelope) {
    try {
      const str = JSON.stringify(envelope);
      if (str.length > MAX_SIGNALING_PAYLOAD_BYTES * 2) {
        logger.signaling.warn('Prevented sending oversized message');
        return;
      }
      this.ws!.send(str);
    } catch (err) {
      logger.signaling.error('Failed to send message', err);
    }
  }

  onSignal(callback: SignalCallback): () => void {
    this.signalCallbacks.add(callback);
    return () => this.signalCallbacks.delete(callback);
  }

  onDisconnect(callback: DisconnectCallback): () => void {
    this.disconnectCallbacks.add(callback);
    return () => this.disconnectCallbacks.delete(callback);
  }

  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      logger.signaling.error('Max reconnect attempts reached');
      return;
    }

    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.signaling.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        logger.signaling.error('Reconnect failed', err);
        this.scheduleReconnect();
      });
    }, delay);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pendingRoom) {
      clearTimeout(this.pendingRoom.timer);
      this.pendingRoom.reject(new Error('Disconnected'));
      this.pendingRoom = null;
    }
    this.ws?.close(1000, 'Intentional disconnect');
    this.ws = null;
    this.connected = false;
    this.signalCallbacks.clear();
    this.disconnectCallbacks.clear();
    this.errorCallbacks.clear();
  }
}
