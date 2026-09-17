import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { TransferRecord, TransferStatus, FileProgress } from '../types';

interface TransferState {
  transfers: Map<string, TransferRecord>; // transferId -> record
  transferList: TransferRecord[]; // cached array for stable selectors
  incomingRequest: TransferRecord | null; // pending accept/reject

  addTransfer: (record: TransferRecord) => void;
  updateTransfer: (transferId: string, patch: Partial<TransferRecord>) => void;
  updateFileProgress: (transferId: string, fileId: string, patch: Partial<FileProgress>) => void;
  setTransferStatus: (transferId: string, status: TransferStatus, error?: string) => void;
  removeTransfer: (transferId: string) => void;
  setIncomingRequest: (record: TransferRecord | null) => void;
  clearCompleted: () => void;
  getTransfer: (transferId: string) => TransferRecord | undefined;
  activeTransfers: () => TransferRecord[];
}

export const useTransferStore = create<TransferState>()(
  subscribeWithSelector((set, get) => ({
    transfers: new Map(),
    transferList: [],
    incomingRequest: null,

    addTransfer(record) {
      const next = new Map(get().transfers);
      next.set(record.transferId, record);
      set({ transfers: next, transferList: Array.from(next.values()) });
    },

    updateTransfer(transferId, patch) {
      const next = new Map(get().transfers);
      const existing = next.get(transferId);
      if (!existing) return;
      next.set(transferId, { ...existing, ...patch });
      set({ transfers: next, transferList: Array.from(next.values()) });
    },

    updateFileProgress(transferId, fileId, patch) {
      const next = new Map(get().transfers);
      const existing = next.get(transferId);
      if (!existing) return;
      const files = existing.files.map((f) =>
        f.fileId === fileId ? { ...f, ...patch } : f
      );
      const totalBytesTransferred = files.reduce((acc, f) => acc + f.bytesTransferred, 0);
      next.set(transferId, { ...existing, files, totalBytesTransferred });
      set({ transfers: next, transferList: Array.from(next.values()) });
    },

    setTransferStatus(transferId, status, error) {
      const next = new Map(get().transfers);
      const existing = next.get(transferId);
      if (!existing) return;
      const patch: Partial<TransferRecord> = { status, error };
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        patch.completedAt = Date.now();
      }
      next.set(transferId, { ...existing, ...patch });
      set({ transfers: next, transferList: Array.from(next.values()) });
    },

    removeTransfer(transferId) {
      const next = new Map(get().transfers);
      next.delete(transferId);
      set({ transfers: next, transferList: Array.from(next.values()) });
    },

    setIncomingRequest(record) {
      set({ incomingRequest: record });
    },

    clearCompleted() {
      const next = new Map(get().transfers);
      for (const [id, record] of next) {
        if (record.status === 'completed' || record.status === 'rejected' || record.status === 'cancelled') {
          next.delete(id);
        }
      }
      set({ transfers: next, transferList: Array.from(next.values()) });
    },

    getTransfer(transferId) {
      return get().transfers.get(transferId);
    },

    activeTransfers() {
      return Array.from(get().transfers.values()).filter(
        (t) => t.status === 'transferring' || t.status === 'waiting' || t.status === 'pending'
      );
    },
  }))
);
