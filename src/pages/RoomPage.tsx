import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LogOut, Users, Wifi, WifiOff, Info, QrCode } from 'lucide-react';

import { Header } from '../components/layout/Header';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { PeerList } from '../features/peers/PeerList';
import { FileDropZone } from '../features/transfers/FileDropZone';
import { TransferQueue } from '../features/transfers/TransferQueue';
import { QRModal } from '../features/qr/QRModal';
import { ConnectionDiagnostics } from '../features/connection/ConnectionDiagnostics';
import { RoomExpiryTimer } from '../features/room/RoomExpiryTimer';

import { useRoomStore } from '../stores/roomStore';
import { useUIStore } from '../stores/uiStore';
import { useTransferStore } from '../stores/transferStore';
import type { AppCtx } from '../App';
import { features } from '../utils/device';

interface Props {
  ctx: AppCtx;
}

export default function RoomPage({ ctx }: Props) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const room = useRoomStore((s) => s.room);
  const myPeerId = useRoomStore((s) => s.myPeerId);
  const isExpired = useRoomStore((s) => s.isExpired);

  const showDiagnostics = useUIStore((s) => s.showDiagnostics);
  const setShowDiagnostics = useUIStore((s) => s.setShowDiagnostics);

  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Network status hint
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // Redirect if room mismatch
  useEffect(() => {
    if (room && room.id !== roomId) {
      navigate('/');
    }
  }, [room, roomId, navigate]);

  // If room doesn't exist, redirect home
  useEffect(() => {
    if (!room && !isExpired) {
      // Give a moment for async join
      const timer = setTimeout(() => {
        if (!useRoomStore.getState().room) {
          navigate('/');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [room, isExpired, navigate]);

  const handleLeave = useCallback(() => {
    ctx.leaveRoom();
  }, [ctx]);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!selectedPeerId) {
        useUIStore.getState().addToast({
          type: 'warning',
          title: 'No device selected',
          message: 'Tap a connected device first, then drop files.',
        });
        return;
      }
      await ctx.sendFiles(selectedPeerId, files);
    },
    [selectedPeerId, ctx]
  );

  if (isExpired) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-6">
              <WifiOff className="w-8 h-8 text-amber-500 dark:text-amber-400" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text-main)] mb-2">Room Expired</h1>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              This room has expired. Create a new room to continue sharing.
            </p>
            <Button onClick={() => navigate('/')} size="lg" className="w-full">
              Create New Room
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Spinner />
            <p className="text-sm text-[var(--color-text-muted)]">Connecting...</p>
          </div>
        </div>
      </div>
    );
  }

  const otherPeers = room.peers.filter((p) => p.id !== myPeerId);

  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        {/* Room header row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-[var(--color-text-main)]">
                  Room{' '}
                  <span className="font-mono text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)] tracking-widest">{room.id}</span>
                </h1>
                {!isOnline && (
                  <span className="text-xs text-amber-500 dark:text-amber-400 flex items-center gap-1">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
              <RoomExpiryTimer expiresAt={room.expiresAt} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              id="show-qr-btn"
              variant="outline"
              size="sm"
              onClick={() => setQrOpen(true)}
            >
              <QrCode className="w-3.5 h-3.5" />
              Invite
            </Button>
            <Button
              id="diagnostics-btn"
              variant="ghost"
              size="sm"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              aria-pressed={showDiagnostics}
            >
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Diagnostics</span>
            </Button>
            <Button
              id="leave-room-btn"
              variant="danger"
              size="sm"
              onClick={handleLeave}
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave
            </Button>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Peers + Drop Zone */}
          <div className="flex flex-col gap-4 flex-1 min-w-0">
            {/* Connected Devices */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-[var(--color-brand-500)]" aria-hidden />
                <h2 className="text-sm font-medium text-[var(--color-text-main)]">Connected Devices</h2>
                <span className="ml-auto text-xs text-[var(--color-text-dim)] font-mono">{otherPeers.length} peer{otherPeers.length !== 1 ? 's' : ''}</span>
              </div>

              {otherPeers.length === 0 ? (
                <EmptyState
                  icon={<Users className="w-8 h-8" />}
                  title="No devices connected"
                  description={`Open ShareDrop on another device and enter room code: ${room.id}`}
                  action={
                    <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}>
                      <QrCode className="w-3.5 h-3.5" />
                      Show QR Code
                    </Button>
                  }
                />
              ) : (
                <PeerList
                  peers={otherPeers}
                  selectedPeerId={selectedPeerId}
                  onSelectPeer={setSelectedPeerId}
                />
              )}
            </Card>

            {/* Drop Zone */}
            <Card className="p-4">
              <FileDropZone
                disabled={!selectedPeerId || otherPeers.length === 0}
                onFilesSelected={handleFilesSelected}
                selectedPeerName={
                  otherPeers.find((p) => p.id === selectedPeerId)?.displayName
                }
              />
            </Card>
          </div>

          {/* Right: Transfer Queue + Diagnostics */}
          <div className="flex flex-col gap-4 lg:w-80">
            <TransferQueue cancelTransfer={ctx.cancelTransfer} />
            {showDiagnostics && (
              <ConnectionDiagnostics peers={otherPeers} />
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <QRModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        roomId={room.id}
      />
    </div>
  );
}
