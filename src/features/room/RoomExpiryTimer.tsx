import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  expiresAt: number;
}

export function RoomExpiryTimer({ expiresAt }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, expiresAt - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const isUrgent = remaining < 5 * 60 * 1000; // under 5 min

  if (remaining === 0) return null;

  return (
    <div
      className={`flex items-center gap-1 text-xs ${isUrgent ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-[var(--color-text-dim)]'}`}
      aria-live="polite"
      aria-label={`Room expires in ${minutes} minutes ${seconds} seconds`}
    >
      <Clock className="w-3 h-3" aria-hidden />
      <span>Expires in {minutes}:{seconds.toString().padStart(2, '0')}</span>
    </div>
  );
}
