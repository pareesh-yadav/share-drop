import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ConnectionInfo, ConnectionState, TransportType } from '../types';

interface ConnectionState_ {
  connections: Map<string, ConnectionInfo>; // peerId -> info

  setConnectionState: (peerId: string, state: ConnectionState) => void;
  setTransportType: (peerId: string, type: TransportType) => void;
  updateConnectionInfo: (peerId: string, patch: Partial<ConnectionInfo>) => void;
  removeConnection: (peerId: string) => void;
  clearAll: () => void;
  getConnection: (peerId: string) => ConnectionInfo | undefined;
}

const DEFAULT_CONNECTION_INFO: ConnectionInfo = {
  state: 'idle',
  transportType: 'unknown',
  iceState: null,
  dataChannelState: null,
  signalingState: null,
};

export const useConnectionStore = create<ConnectionState_>()(
  subscribeWithSelector((set, get) => ({
    connections: new Map(),

    setConnectionState(peerId, state) {
      const conn = get().connections.get(peerId) ?? { ...DEFAULT_CONNECTION_INFO };
      const next = new Map(get().connections);
      next.set(peerId, { ...conn, state });
      if (state === 'connected' && !conn.connectedAt) {
        next.set(peerId, { ...conn, state, connectedAt: Date.now() });
      }
      set({ connections: next });
    },

    setTransportType(peerId, type) {
      const conn = get().connections.get(peerId) ?? { ...DEFAULT_CONNECTION_INFO };
      const next = new Map(get().connections);
      next.set(peerId, { ...conn, transportType: type });
      set({ connections: next });
    },

    updateConnectionInfo(peerId, patch) {
      const conn = get().connections.get(peerId) ?? { ...DEFAULT_CONNECTION_INFO };
      const next = new Map(get().connections);
      next.set(peerId, { ...conn, ...patch });
      set({ connections: next });
    },

    removeConnection(peerId) {
      const next = new Map(get().connections);
      next.delete(peerId);
      set({ connections: next });
    },

    clearAll() {
      set({ connections: new Map() });
    },

    getConnection(peerId) {
      return get().connections.get(peerId);
    },
  }))
);
