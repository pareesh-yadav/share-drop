import { create } from 'zustand';

type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface UIState {
  toasts: Toast[];
  isDemoMode: boolean;
  showDiagnostics: boolean;
  showDebugLog: boolean;
  isLeaveDialogOpen: boolean;
  pendingLeaveAction: (() => void) | null;

  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setDemoMode: (v: boolean) => void;
  setShowDiagnostics: (v: boolean) => void;
  setShowDebugLog: (v: boolean) => void;
  setLeaveDialog: (open: boolean, action?: () => void) => void;
}

let toastId = 0;

export const useUIStore = create<UIState>()((set) => ({
  toasts: [],
  isDemoMode: false,
  showDiagnostics: false,
  showDebugLog: false,
  isLeaveDialogOpen: false,
  pendingLeaveAction: null,

  addToast(toast) {
    const id = `toast-${++toastId}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 4000);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setDemoMode(isDemoMode) {
    set({ isDemoMode });
  },

  setShowDiagnostics(showDiagnostics) {
    set({ showDiagnostics });
  },

  setShowDebugLog(showDebugLog) {
    set({ showDebugLog });
  },

  setLeaveDialog(open, action) {
    set({ isLeaveDialogOpen: open, pendingLeaveAction: action ?? null });
  },
}));
