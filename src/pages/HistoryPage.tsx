import React, { useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, EmptyState } from '../components/ui';
import { History, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { formatBytes, formatTime, formatDate } from '../utils/format';

// In a full implementation, history is persisted to IndexedDB via Dexie
// For Phase 1, history is read from transferStore completed transfers
import { useTransferStore } from '../stores/transferStore';
import type { TransferRecord } from '../types';
import { cn } from '../utils/cn';

export default function HistoryPage() {
  const transfers = useTransferStore((s) => s.transferList);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);

  const completed = useMemo(
    () =>
      transfers
        .filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [transfers]
  );

  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--color-text-main)]">History</h1>
          {completed.length > 0 && (
            <button
              onClick={clearCompleted}
              className="flex items-center gap-1.5 text-xs text-red-500/70 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {completed.length === 0 ? (
          <Card className="p-4">
            <EmptyState
              icon={<History className="w-8 h-8" />}
              title="No transfer history"
              description="Completed transfers will appear here. History is stored locally and never uploaded."
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {completed.map((t) => (
              <HistoryItem key={t.transferId} transfer={t} />
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--color-text-dim)] text-center">
          History stores metadata only — file names and sizes. File contents are never stored.
        </p>
      </main>
    </div>
  );
}

function HistoryItem({ transfer }: { transfer: TransferRecord }) {
  const { direction, peerName, files, totalSize, status, startedAt, completedAt } = transfer;
  const isSend = direction === 'send';

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5',
          isSend ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400' : 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400'
        )}>
          {isSend ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-[var(--color-text-main)] font-medium truncate">
                {files.length === 1 ? files[0].name : `${files.length} files`}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isSend ? 'Sent to' : 'Received from'} {peerName} · {formatBytes(totalSize)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn(
                'text-xs font-medium capitalize',
                status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' :
                status === 'failed' ? 'text-red-500 dark:text-red-400' : 'text-[var(--color-text-dim)]'
              )}>
                {status}
              </p>
              {completedAt && (
                <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                  {formatDate(startedAt)} {formatTime(completedAt)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
