import React from 'react';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../../components/ui';
import { AlertTriangle } from 'lucide-react';

export function LeaveRoomDialog() {
  const isOpen = useUIStore((s) => s.isLeaveDialogOpen);
  const pendingAction = useUIStore((s) => s.pendingLeaveAction);
  const setLeaveDialog = useUIStore((s) => s.setLeaveDialog);

  if (!isOpen) return null;

  function handleLeave() {
    setLeaveDialog(false);
    pendingAction?.();
  }

  function handleStay() {
    setLeaveDialog(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm leave room"
    >
      <div className="glass rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-[var(--color-text-main)]">Leave Room?</h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mb-5">
          You have active transfers in progress. Leaving will cancel them.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button id="stay-in-room-btn" variant="secondary" size="md" onClick={handleStay}>
            Stay
          </Button>
          <Button id="confirm-leave-btn" variant="danger" size="md" onClick={handleLeave}>
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
}
