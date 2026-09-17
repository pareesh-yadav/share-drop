import React, { memo, useMemo } from 'react';
import {
  ArrowUp, ArrowDown, X, CheckCircle2, XCircle, Clock, Zap, ShieldCheck,
} from 'lucide-react';
import { useTransferStore } from '../../stores/transferStore';
import { Button, Card, ProgressBar, Badge, EmptyState } from '../../components/ui';
import { formatBytes, formatSpeed, formatEta, calcPercent } from '../../utils/format';
import { cn } from '../../utils/cn';
import type { TransferRecord } from '../../types';

interface Props {
  cancelTransfer: (transferId: string, peerId: string) => void;
}

export function TransferQueue({ cancelTransfer }: Props) {
  const transfers = useTransferStore((s) => s.transferList);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);

  const active = useMemo(
    () =>
      transfers.filter((t) =>
        ['transferring', 'waiting', 'pending'].includes(t.status)
      ),
    [transfers]
  );
  const done = useMemo(
    () =>
      transfers.filter((t) =>
        ['completed', 'failed', 'cancelled', 'rejected'].includes(t.status)
      ),
    [transfers]
  );

  if (transfers.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-medium text-[var(--color-text-main)] mb-3">Transfers</h2>
        <EmptyState
          icon={<Zap className="w-8 h-8" />}
          title="No transfers"
          description="Select a device and drop files to start sending."
        />
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--color-text-main)]">
          Transfers
          {active.length > 0 && (
            <Badge variant="info" className="ml-2">{active.length} active</Badge>
          )}
        </h2>
        {done.length > 0 && (
          <button
            onClick={clearCompleted}
            className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
          >
            Clear done
          </button>
        )}
      </div>

      <div className="space-y-3 max-h-[480px] overflow-y-auto">
        {active.map((t) => (
          <TransferCard key={t.transferId} transfer={t} cancelTransfer={cancelTransfer} />
        ))}
        {done.length > 0 && active.length > 0 && (
          <hr className="border-[var(--color-surface-3)]" />
        )}
        {done.map((t) => (
          <TransferCard key={t.transferId} transfer={t} cancelTransfer={cancelTransfer} />
        ))}
      </div>
    </Card>
  );
}

const TransferCard = memo(function TransferCard({
  transfer,
  cancelTransfer,
}: {
  transfer: TransferRecord;
  cancelTransfer: (id: string, peerId: string) => void;
}) {
  const { transferId, direction, peerName, files, totalSize, totalBytesTransferred, status, speed, eta } = transfer;
  const percent = calcPercent(totalBytesTransferred, totalSize);
  const isActive = status === 'transferring' || status === 'waiting';

  return (
    <div
      className={cn(
        'rounded-xl border p-3 space-y-2 transition-colors',
        status === 'completed' ? 'border-emerald-500/20 bg-emerald-500/5' :
        status === 'failed' ? 'border-red-500/20 bg-red-500/5' :
        status === 'cancelled' || status === 'rejected' ? 'border-[var(--color-surface-3)]/50 opacity-60' :
        'border-[var(--color-surface-3)] bg-[var(--color-surface-2)]'
      )}
      aria-label={`Transfer ${direction === 'send' ? 'to' : 'from'} ${peerName}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {/* Direction arrow */}
          <div className={cn(
            'w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5',
            direction === 'send' ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400' : 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400'
          )}>
            {direction === 'send'
              ? <ArrowUp className="w-3.5 h-3.5" />
              : <ArrowDown className="w-3.5 h-3.5" />}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-main)] truncate">
              {files.length === 1
                ? files[0].name
                : `${files.length} files`}
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              {direction === 'send' ? 'To' : 'From'} {peerName} · {formatBytes(totalSize)}
            </p>
          </div>
        </div>

        {/* Status icon */}
        <StatusIcon status={status} />
      </div>

      {/* Progress */}
      {isActive && (
        <div className="space-y-1.5">
          <ProgressBar value={percent} animate label={`${percent}% transferred`} />
          <div className="flex items-center justify-between text-xs text-[var(--color-text-dim)]">
            <span>
              {formatBytes(totalBytesTransferred)} / {formatBytes(totalSize)}{' '}
              <span className="font-medium text-[var(--color-text-main)]">{percent}%</span>
            </span>
            <span className="flex items-center gap-2">
              <span>{formatSpeed(speed)}</span>
              {eta > 0 && <span>~{formatEta(eta)}</span>}
            </span>
          </div>
        </div>
      )}

      {/* Integrity check */}
      {status === 'completed' && files.some((f) => f.integrityVerified) && (
        <div className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3 h-3" aria-hidden />
          <span className="text-xs">Integrity verified</span>
        </div>
      )}

      {/* Error */}
      {status === 'failed' && transfer.error && (
        <p className="text-xs text-red-400">{transfer.error}</p>
      )}

      {/* Cancel button */}
      {isActive && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => cancelTransfer(transferId, transfer.peerId)}
          className="w-full"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </Button>
      )}
    </div>
  );
});

function StatusIcon({ status }: { status: TransferRecord['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-label="Completed" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400 shrink-0" aria-label="Failed" />;
    case 'cancelled':
    case 'rejected':
      return <XCircle className="w-4 h-4 text-white/30 shrink-0" aria-label="Cancelled" />;
    case 'transferring':
      return (
        <div className="w-3 h-3 rounded-full border-2 border-[var(--color-brand-500)] border-t-transparent animate-spin shrink-0" aria-label="Transferring" />
      );
    case 'waiting':
    case 'pending':
      return <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" aria-label="Waiting" />;
    default:
      return null;
  }
}
