import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FolderOpen, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatBytes } from '../../utils/format';

interface Props {
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  selectedPeerName?: string;
}

const LARGE_FILE_WARN_BYTES = 500 * 1024 * 1024; // 500 MB

export function FileDropZone({ disabled, onFilesSelected, selectedPeerName }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onFilesSelected(accepted);
      }
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject, acceptedFiles } = useDropzone({
    onDrop,
    disabled,
    multiple: true,
    maxFiles: 100,
  });

  const totalSize = acceptedFiles.reduce((acc, f) => acc + f.size, 0);
  const hasLargeFile = acceptedFiles.some((f) => f.size > LARGE_FILE_WARN_BYTES);

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        id="file-drop-zone"
        className={cn(
          'relative rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-400)]',
          disabled
            ? 'border-[var(--color-surface-3)]/40 opacity-40 cursor-not-allowed pointer-events-none'
            : isDragActive && !isDragReject
            ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 scale-[1.01]'
            : isDragReject
            ? 'border-red-500 bg-red-500/10'
            : 'border-[var(--color-surface-3)] hover:border-[var(--color-brand-500)]/50 hover:bg-[var(--color-surface-2)]/50'
        )}
        role="button"
        tabIndex={0}
        aria-label={
          disabled
            ? 'File drop zone — select a device first'
            : 'Drop files here or click to browse'
        }
      >
        <input {...getInputProps()} aria-hidden />

        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
            isDragActive && !isDragReject
              ? 'bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)] dark:text-[var(--color-brand-400)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]'
          )}>
            <Upload className="w-6 h-6" aria-hidden />
          </div>

          {isDragActive && !isDragReject ? (
            <p className="text-sm font-medium text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)]">
              Drop files here
            </p>
          ) : isDragReject ? (
            <p className="text-sm font-medium text-red-500 dark:text-red-400">
              Some files are not supported
            </p>
          ) : disabled ? (
            <p className="text-sm text-[var(--color-text-dim)]">
              Select a device above first
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--color-text-muted)]">
                {selectedPeerName
                  ? `Drop files to send to ${selectedPeerName}`
                  : 'Drop files here or click to browse'}
              </p>
              <p className="text-xs text-[var(--color-text-dim)]">Any file type · Up to 100 files</p>
            </>
          )}
        </div>
      </div>

      {/* Large file warning */}
      {hasLargeFile && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-amber-300/80">
            One or more files are larger than 500 MB. Transfer success depends on network conditions,
            browser memory, and NAT traversal. Large transfers may require more time or a TURN relay.
          </p>
        </div>
      )}
    </div>
  );
}
