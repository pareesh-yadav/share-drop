/**
 * LocalSignalingTransport
 *
 * Uses BroadcastChannel and localStorage to simulate signaling between tabs.
 * FOR LOCAL DEVELOPMENT ONLY — does not require a WebSocket server.
 *
 * Robust cross-tab features:
 * - Persists rooms in localStorage with 30-minute TTL (not deleted on reload)
 * - Broadcasts room:query & room:announce for immediate cross-tab discovery
 * - Fuzzy-matches room codes (handles 0 vs O, 1 vs I, case-insensitivity)
 */

import { PROTOCOL_VERSION, ROOM_TTL_MS } from '../../types';
import type { Room, SignalingMessage } from '../../types';
import { generatePeerId, generateRoomId } from '../../utils/crypto';
import { detectDeviceType } from '../../utils/device';
import { logger } from '../../utils/logger';
import type { SignalingTransport, SignalCallback, DisconnectCallback, ErrorCallback } from './SignalingTransport';

const CHANNEL_NAME = 'sharedrop-local-signaling';
const STORAGE_KEY = 'sharedrop_local_rooms';

// In-memory fallback
const localRoomsMemory = new Map<string, Room>();

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function fuzzyCode(str: string): string {
  return normalizeCode(str).replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function getStoredRooms(): Map<string, Room> {
  const map = new Map<string, Room>();
  const now = Date.now();

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, Room>;
        for (const [id, r] of Object.entries(parsed)) {
          if (r && r.expiresAt > now) {
            map.set(normalizeCode(id), r);
          }
        }
      }
    } catch {
      // fallback
    }
  }

  for (const [id, r] of localRoomsMemory.entries()) {
    if (r && r.expiresAt > now && !map.has(normalizeCode(id))) {
      map.set(normalizeCode(id), r);
    }
  }

  return map;
}

export function saveStoredRoom(room: Room) {
  const normalizedId = normalizeCode(room.id);
  localRoomsMemory.set(normalizedId, room);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rooms = getStoredRooms();
      rooms.set(normalizedId, room);
      const obj: Record<string, Room> = {};
      for (const [id, r] of rooms.entries()) {
        obj[id] = r;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // fallback
    }
  }
}

export function findRoomMatch(targetId: string): Room | undefined {
  const rooms = getStoredRooms();
  const cleanTarget = normalizeCode(targetId);

  // Exact match
  if (rooms.has(cleanTarget)) {
    return rooms.get(cleanTarget);
  }

  // Fuzzy match (0 <-> O, 1 <-> I)
  const targetFuzzy = fuzzyCode(cleanTarget);
  for (const [id, room] of rooms.entries()) {
    if (fuzzyCode(id) === targetFuzzy) {
      return room;
    }
  }

  return undefined;
}

function removePeerFromStoredRoom(roomId: string, peerId: string) {
  const rooms = getStoredRooms();
  const room = findRoomMatch(roomId);
  if (room) {
    // Retain room even if 0 peers remain, so users can reconnect or reload
    room.peers = room.peers.filter((p) => p.id !== peerId);
    saveStoredRoom(room);
  }
}

export class LocalSignalingTransport implements SignalingTransport {
  private channel: BroadcastChannel | null = null;
  private myPeerId: string = '';
  private roomId: string = '';
  private currentRoom: Room | null = null;
  private signalCallbacks: Set<SignalCallback> = new Set();
  private disconnectCallbacks: Set<DisconnectCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  private _connected = false;
  private unloadHandler: (() => void) | null = null;

  async connect(): Promise<void> {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // Handle room discovery queries between tabs
      if (msg.type === 'room:query') {
        const queryFuzzy = fuzzyCode(msg.roomId);
        if (this.currentRoom && (fuzzyCode(this.currentRoom.id) === queryFuzzy || this.roomId === msg.roomId)) {
          this.channel?.postMessage({
            type: 'room:announce',
            roomId: this.currentRoom.id,
            room: this.currentRoom,
            toPeerId: msg.fromPeerId,
          });
        }
        return;
      }

      if (msg.type === 'room:announce' && msg.room) {
        saveStoredRoom(msg.room);
      }

      // Route signaling messages
      const sigMsg = msg as SignalingMessage;
      if (!sigMsg.toPeerId || sigMsg.toPeerId === this.myPeerId) {
        if (sigMsg.fromPeerId !== this.myPeerId) {
          this.signalCallbacks.forEach((cb) => cb(sigMsg));
        }
      }
    };
    this._connected = true;

    if (typeof window !== 'undefined') {
      this.unloadHandler = () => this.disconnect();
      window.addEventListener('beforeunload', this.unloadHandler);
    }

    logger.signaling.info('LocalSignalingTransport connected (BroadcastChannel)');
  }

  async createRoom(displayName: string, deviceType: string): Promise<{ room: Room; myPeerId: string }> {
    const roomId = generateRoomId();
    const peerId = generatePeerId();
    this.myPeerId = peerId;
    this.roomId = roomId;

    const now = Date.now();
    const room: Room = {
      id: roomId,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      peers: [{
        id: peerId,
        displayName,
        deviceType: (deviceType as ReturnType<typeof detectDeviceType>) ?? 'desktop',
        connectedAt: now,
      }],
    };

    this.currentRoom = room;
    saveStoredRoom(room);

    // Announce room to any waiting peers
    this.channel?.postMessage({
      type: 'room:announce',
      roomId,
      room,
    });

    logger.signaling.info(`[Local] Created room ${roomId}`);
    return { room, myPeerId: peerId };
  }

  async joinRoom(
    roomId: string,
    displayName: string,
    deviceType: string
  ): Promise<{ room: Room; myPeerId: string }> {
    let existing = findRoomMatch(roomId);

    // If not found in localStorage immediately, query active tabs over BroadcastChannel
    if (!existing && this.channel) {
      const tempPeerId = generatePeerId();
      this.channel.postMessage({
        type: 'room:query',
        roomId,
        fromPeerId: tempPeerId,
      });

      // Wait briefly (up to 300ms) for an announcement from an active host tab
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        const handler = (e: MessageEvent) => {
          if (e.data?.type === 'room:announce' && e.data?.room) {
            const queryFuzzy = fuzzyCode(roomId);
            if (fuzzyCode(e.data.room.id) === queryFuzzy) {
              existing = e.data.room;
              saveStoredRoom(existing!);
              clearTimeout(timer);
              this.channel?.removeEventListener('message', handler);
              resolve();
            }
          }
        };

        this.channel?.addEventListener('message', handler);
        timer = setTimeout(() => {
          this.channel?.removeEventListener('message', handler);
          resolve();
        }, 300);
      });

      // Check again after query
      if (!existing) {
        existing = findRoomMatch(roomId);
      }
    }

    if (!existing) {
      throw new Error(`Room ${roomId.toUpperCase()} not found or has expired. Check the code and try again.`);
    }

    const peerId = generatePeerId();
    this.myPeerId = peerId;
    this.roomId = existing.id; // use official room ID casing

    const now = Date.now();
    const peer = {
      id: peerId,
      displayName,
      deviceType: (deviceType as ReturnType<typeof detectDeviceType>) ?? 'mobile',
      connectedAt: now,
    };

    // Add peer without duplicates
    if (!existing.peers.some((p) => p.id === peerId)) {
      existing.peers.push(peer);
    }
    this.currentRoom = existing;
    saveStoredRoom(existing);

    // Notify other peers in the room
    const joinMsg: SignalingMessage = {
      type: 'peer:joined',
      roomId: existing.id,
      fromPeerId: peerId,
      timestamp: now,
      protocolVersion: PROTOCOL_VERSION,
      peer,
    };
    this.channel?.postMessage(joinMsg);

    logger.signaling.info(`[Local] Joined room ${existing.id} as ${peerId}`);
    return { room: existing, myPeerId: peerId };
  }

  sendSignal(msg: SignalingMessage): void {
    logger.signaling.debug(`[Local] Sending: ${msg.type}`);
    this.channel?.postMessage(msg);
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
    return this._connected;
  }

  disconnect(): void {
    // Notify other peers we're leaving
    if (this.roomId && this.myPeerId && this.channel) {
      const leaveMsg: SignalingMessage = {
        type: 'peer:left',
        roomId: this.roomId,
        fromPeerId: this.myPeerId,
        peerId: this.myPeerId,
        timestamp: Date.now(),
        protocolVersion: PROTOCOL_VERSION,
      };
      this.channel.postMessage(leaveMsg);
    }

    if (this.roomId && this.myPeerId) {
      removePeerFromStoredRoom(this.roomId, this.myPeerId);
    }

    if (this.unloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.unloadHandler);
      this.unloadHandler = null;
    }

    this.channel?.close();
    this.channel = null;
    this._connected = false;
    this.currentRoom = null;
    this.signalCallbacks.clear();
    this.disconnectCallbacks.clear();
    this.errorCallbacks.clear();
  }
}
