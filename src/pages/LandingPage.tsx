import React, { useState } from 'react';
import { ArrowRight, Shield, Zap, Globe, Share2, Lock } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button, Input, Divider } from '../components/ui';
import type { AppCtx } from '../App';
import { decodeJoinToken } from '../utils/crypto';

interface Props {
  ctx: AppCtx;
}

export default function LandingPage({ ctx }: Props) {
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      await ctx.createRoom();
    } catch {
      setError('Failed to create room. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setError('');
    try {
      // Support either room code or full join URL/token
      let roomId = code;
      if (code.startsWith('http')) {
        const url = new URL(code);
        const token = url.pathname.split('/join/')[1];
        if (token) roomId = decodeJoinToken(token) ?? code;
      }
      const success = await ctx.joinRoom(roomId);
      if (!success) setError('Room not found or has expired. Check the code and try again.');
    } catch {
      setError('Failed to join room. Please check the code and try again.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center px-4 pt-16 pb-24">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          {/* Logo mark */}
          <div className="flex items-center justify-center mb-8">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-700)] flex items-center justify-center shadow-2xl shadow-[var(--color-brand-500)]/30">
                <Share2 className="w-10 h-10 text-white" aria-hidden />
              </div>
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-700)] blur-xl opacity-30 -z-10" />
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-[var(--color-text-main)] mb-4">
            Share files{' '}
            <span className="text-gradient">directly</span>.
          </h1>
          <p className="text-lg text-[var(--color-text-muted)] leading-relaxed max-w-xl mx-auto">
            Fast, browser-based peer-to-peer file transfers powered by WebRTC.{' '}
            Files travel directly between devices — no permanent cloud storage.
          </p>
        </div>

        {/* Action Card */}
        <div className="w-full max-w-sm mx-auto">
          <div className="glass rounded-2xl p-6 space-y-6">
            <Button
              id="create-room-btn"
              onClick={handleCreate}
              loading={creating}
              disabled={creating || joining}
              size="lg"
              className="w-full"
            >
              <Share2 className="w-5 h-5" aria-hidden />
              Create Room
              <ArrowRight className="w-4 h-4 ml-auto" aria-hidden />
            </Button>

            <Divider label="or join" />

            <form onSubmit={handleJoin} className="space-y-3">
              <Input
                id="room-code-input"
                label="Room Code"
                placeholder="AB7K9X"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase().slice(0, 32));
                  setError('');
                }}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-widest text-center text-lg"
                aria-describedby={error ? 'join-error' : undefined}
              />
              {error && (
                <p id="join-error" className="text-xs text-red-500 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}
              <Button
                id="join-room-btn"
                type="submit"
                variant="outline"
                loading={joining}
                disabled={!roomCode.trim() || creating || joining}
                size="lg"
                className="w-full"
              >
                Join Room
              </Button>
            </form>
          </div>
        </div>

        {/* WebRTC Visualization */}
        <div className="mt-20 w-full max-w-lg mx-auto">
          <WebRTCVisualization />
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl mx-auto">
          <FeatureCard
            icon={<Zap className="w-5 h-5" />}
            title="Direct Transfer"
            description="Files go peer-to-peer when possible — no upload to a central server."
          />
          <FeatureCard
            icon={<Lock className="w-5 h-5" />}
            title="Encrypted in Transit"
            description="WebRTC encrypts all data channel traffic using DTLS-SRTP."
          />
          <FeatureCard
            icon={<Globe className="w-5 h-5" />}
            title="Works Anywhere"
            description="Any modern browser. No app install. No account required."
          />
        </div>

        {/* Privacy note */}
        <p className="mt-12 text-xs text-[var(--color-text-dim)] text-center max-w-sm">
          <Shield className="inline w-3 h-3 mr-1 opacity-60 text-[var(--color-brand-500)]" aria-hidden />
          Signaling (connection setup) briefly routes through our server. File data uses WebRTC P2P when possible,
          or TURN relay if required by your network. No files are stored.
        </p>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl p-5 bg-[var(--color-surface-1)] border border-[var(--color-surface-3)] space-y-3 card-shadow">
      <div className="w-9 h-9 rounded-xl bg-[var(--color-brand-500)]/15 flex items-center justify-center text-[var(--color-brand-500)] dark:text-[var(--color-brand-400)]">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-main)]">{title}</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function WebRTCVisualization() {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-mono mb-4">How it works</p>
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <DeviceNode label="Your Device" icon="💻" />
        <ConnectionLine />
        <SignalingNode />
        <ConnectionLine />
        <DeviceNode label="Other Device" icon="📱" />
      </div>
      <div className="flex items-center gap-2 mt-4">
        <div className="h-px w-20 bg-gradient-to-r from-transparent to-[var(--color-brand-500)]/50" />
        <span className="text-[10px] text-[var(--color-text-dim)] font-mono whitespace-nowrap">WebRTC DataChannel (direct)</span>
        <div className="h-px w-20 bg-gradient-to-l from-transparent to-[var(--color-brand-500)]/50" />
      </div>
    </div>
  );
}

function DeviceNode({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-surface-3)] flex items-center justify-center text-2xl shadow-sm">
        {icon}
      </div>
      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap font-medium">{label}</span>
    </div>
  );
}

function SignalingNode() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-500)]/15 border border-[var(--color-brand-500)]/30 flex items-center justify-center">
        <Share2 className="w-4 h-4 text-[var(--color-brand-500)] dark:text-[var(--color-brand-400)]" aria-hidden />
      </div>
      <span className="text-[10px] text-[var(--color-text-dim)] font-mono">Signaling</span>
    </div>
  );
}

function ConnectionLine() {
  return (
    <div className="flex items-center gap-1">
      <div className="h-px w-8 sm:w-12 bg-gradient-to-r from-[var(--color-surface-3)] to-[var(--color-brand-500)]/40 animate-pulse-slow" />
    </div>
  );
}
