import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Room, Peer } from '../types';
import { ROOM_TTL_MS } from '../types';

interface RoomState {
  room: Room | null;
  myPeerId: string | null;
  isExpired: boolean;

  setRoom: (room: Room, myPeerId: string) => void;
  addPeer: (peer: Peer) => void;
  removePeer: (peerId: string) => void;
  expireRoom: () => void;
  clearRoom: () => void;
  timeUntilExpiry: () => number;
}

export const useRoomStore = create<RoomState>()(
  subscribeWithSelector((set, get) => ({
    room: null,
    myPeerId: null,
    isExpired: false,

    setRoom(room, myPeerId) {
      set({ room, myPeerId, isExpired: false });
    },

    addPeer(peer) {
      set((s) => {
        if (!s.room) return s;
        const exists = s.room.peers.find((p) => p.id === peer.id);
        if (exists) return s;
        return { room: { ...s.room, peers: [...s.room.peers, peer] } };
      });
    },

    removePeer(peerId) {
      set((s) => {
        if (!s.room) return s;
        return { room: { ...s.room, peers: s.room.peers.filter((p) => p.id !== peerId) } };
      });
    },

    expireRoom() {
      set({ isExpired: true });
    },

    clearRoom() {
      set({ room: null, myPeerId: null, isExpired: false });
    },

    timeUntilExpiry() {
      const { room } = get();
      if (!room) return 0;
      return Math.max(0, room.expiresAt - Date.now());
    },
  }))
);

/**
 * Derive the room expiry time. Falls back to TTL if not set.
 */
export function createRoom(id: string, myPeerId: string): Room {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    peers: [],
  };
}
