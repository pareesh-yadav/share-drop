import React from 'react';
import { FileDown, FileUp, X, Check } from 'lucide-react';
import { useTransferStore } from '../../stores/transferStore';
import { Button } from '../../components/ui';
import { formatBytes } from '../../utils/format';

interface Props {
  acceptTransfer: (transferId: string, peerId: string) => void;
  rejectTransfer: (transferId: string, peerId: string) => void;
}

export function IncomingTransferDialog({ acceptTransfer, rejectTransfer }: Props) {
  const request = useTransferStore((s) => s.incomingRequest);

  if (!request) return null;

  const { transferId, peerId, peerName, files, totalSize } = request;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Incoming transfer from ${peerName}`}
    >
      <div className="glass rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <FileDown className="w-5 h-5 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-main)]">Incoming Transfer</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{peerName} wants to send files</p>
          </div>
        </div>

        {/* File list */}
        <div className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-surface-3)] divide-y divide-[var(--color-surface-3)] mb-5">
          {files.slice(0, 5).map((file) => (
            <div key={file.fileId} className="flex items-center gap-3 px-3 py-2">
              <FileUp className="w-3.5 h-3.5 text-[var(--color-text-dim)] shrink-0" aria-hidden />
              <span className="text-sm text-[var(--color-text-main)] truncate flex-1">{file.name}</span>
              <span className="text-xs text-[var(--color-text-muted)] shrink-0">{formatBytes(file.size)}</span>
            </div>
          ))}
          {files.length > 5 && (
            <div className="px-3 py-2 text-xs text-[var(--color-text-dim)]">
              +{files.length - 5} more files
            </div>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between mb-5 text-sm">
          <span className="text-[var(--color-text-muted)]">{files.length} file{files.length !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-[var(--color-text-main)]">{formatBytes(totalSize)}</span>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            id="reject-transfer-btn"
            variant="danger"
            size="lg"
            onClick={() => rejectTransfer(transferId, peerId)}
          >
            <X className="w-4 h-4" />
            Reject
          </Button>
          <Button
            id="accept-transfer-btn"
            size="lg"
            onClick={() => acceptTransfer(transferId, peerId)}
          >
            <Check className="w-4 h-4" />
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
