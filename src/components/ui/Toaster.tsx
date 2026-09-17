import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3',
              'glass shadow-lg backdrop-blur-lg',
              'animate-in slide-in-from-right-4 fade-in duration-200',
              COLORS[toast.type]
            )}
            role="alert"
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{toast.title}</p>
              {toast.message && (
                <p className="text-xs mt-0.5 opacity-80">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
