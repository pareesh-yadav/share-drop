import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Share2, ArrowRight } from 'lucide-react';
import { decodeJoinToken } from '../utils/crypto';
import { Button, Spinner } from '../components/ui';
import type { AppCtx } from '../App';

interface Props {
  ctx: AppCtx;
}

export default function JoinPage({ ctx }: Props) {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid join link.');
      return;
    }
    const decoded = decodeJoinToken(token);
    if (!decoded) {
      setError('This join link is invalid or has been corrupted.');
      return;
    }
    setRoomId(decoded);
  }, [token]);

  async function handleJoin() {
    if (!roomId) return;
    setJoining(true);
    try {
      const success = await ctx.joinRoom(roomId);
      if (!success) {
        setError('Room not found or has expired.');
        setJoining(false);
      }
    } catch {
      setError('Failed to join room. Please try again.');
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="glass rounded-2xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-700)] flex items-center justify-center mx-auto shadow-lg shadow-[var(--color-brand-500)]/30">
            <Share2 className="w-8 h-8 text-white" aria-hidden />
          </div>

          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-main)]">Join ShareDrop Room</h1>
            {roomId && (
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Room:{' '}
                <span className="font-mono text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)] font-bold tracking-widest">{roomId}</span>
              </p>
            )}
          </div>

          {error ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate('/')}>
                Go Home
              </Button>
            </div>
          ) : joining ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Spinner />
              <p className="text-sm text-[var(--color-text-muted)]">Joining room...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Button id="confirm-join-btn" size="lg" className="w-full" onClick={handleJoin} disabled={!roomId}>
                Join Room
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/')}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
