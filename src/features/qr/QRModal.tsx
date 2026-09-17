import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Share2, Download, Check, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui';
import { generateJoinToken } from '../../utils/crypto';
import { features } from '../../utils/device';

interface Props {
  open: boolean;
  onClose: () => void;
  roomId: string;
}

export function QRModal({ open, onClose, roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const joinToken = generateJoinToken(roomId);
  const joinUrl = `${window.location.origin}/join/${joinToken}`;

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, joinUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0f0f1a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).catch(console.error);
  }, [open, joinUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }

  async function shareLink() {
    if (!features.webShare()) return;
    try {
      await navigator.share({
        title: 'Join ShareDrop Room',
        text: `Join my ShareDrop room (${roomId})`,
        url: joinUrl,
      });
    } catch {
      // Share cancelled or not supported
    }
  }

  async function downloadQR() {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `sharedrop-${roomId}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Share room QR code"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-main)]">Invite to Room</h2>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              Scan QR or share the code:{' '}
              <span className="font-mono text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)] tracking-widest font-bold">{roomId}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-dim)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-2)] transition-all cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code */}
        <div className="flex items-center justify-center mb-5">
          <div className="rounded-2xl overflow-hidden border border-[var(--color-surface-3)] bg-white p-3 shadow-md">
            <canvas
              ref={canvasRef}
              width={240}
              height={240}
              style={{ display: 'block' }}
              aria-label={`QR code for room ${roomId}`}
            />
          </div>
        </div>

        {/* URL display */}
        <div className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-surface-3)] px-3 py-2 mb-4 flex items-center gap-2">
          <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-dim)] shrink-0" aria-hidden />
          <p className="text-xs text-[var(--color-text-muted)] font-mono truncate flex-1">{joinUrl}</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            id="copy-link-btn"
            variant="secondary"
            size="sm"
            onClick={copyLink}
            className="flex-col h-14 gap-1"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span className="text-xs">{copied ? 'Copied!' : 'Copy'}</span>
          </Button>

          {features.webShare() && (
            <Button
              id="share-link-btn"
              variant="secondary"
              size="sm"
              onClick={shareLink}
              className="flex-col h-14 gap-1"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-xs">Share</span>
            </Button>
          )}

          <Button
            id="download-qr-btn"
            variant="secondary"
            size="sm"
            onClick={downloadQR}
            className="flex-col h-14 gap-1"
          >
            <Download className="w-4 h-4" />
            <span className="text-xs">Download</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
