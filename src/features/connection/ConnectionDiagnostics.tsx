import React, { useState } from 'react';
import { Activity, Wifi, Radio, Database, Zap } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { Card, Badge } from '../../components/ui';
import type { Peer } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  peers: Peer[];
}

export function ConnectionDiagnostics({ peers }: Props) {
  const connections = useConnectionStore((s) => s.connections);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--color-brand-500)]" aria-hidden />
        <h3 className="text-sm font-medium text-[var(--color-text-main)]">Connection Diagnostics</h3>
      </div>

      {peers.length === 0 ? (
        <p className="text-xs text-[var(--color-text-dim)]">No peers connected</p>
      ) : (
        peers.map((peer) => {
          const info = connections.get(peer.id);
          return (
            <div key={peer.id} className="rounded-xl bg-[var(--color-surface-2)] p-3 space-y-2 border border-[var(--color-surface-3)]">
              <p className="text-xs font-medium text-[var(--color-text-main)] truncate">{peer.displayName}</p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
                <DiagRow label="Status" value={info?.state ?? 'unknown'} color={stateColor(info?.state)} />
                <DiagRow label="Transport" value={info?.transportType ?? '—'} color={info?.transportType === 'direct' ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'} />
                <DiagRow label="ICE" value={info?.iceState ?? '—'} />
                <DiagRow label="DataChannel" value={info?.dataChannelState ?? '—'} />
                <DiagRow label="Signaling" value={info?.signalingState ?? '—'} />
              </div>
            </div>
          );
        })
      )}

      <div className="text-xs text-[var(--color-text-dim)] pt-1">
        This panel is for diagnostics only. Do not share ICE/signaling state publicly.
      </div>
    </Card>
  );
}

function DiagRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <>
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span className={cn('text-[var(--color-text-muted)] truncate', color)}>{value}</span>
    </>
  );
}

function stateColor(state?: string) {
  switch (state) {
    case 'connected': return 'text-emerald-500 dark:text-emerald-400';
    case 'connecting':
    case 'reconnecting': return 'text-amber-500 dark:text-amber-400';
    case 'failed': return 'text-red-500 dark:text-red-400';
    default: return 'text-[var(--color-text-dim)]';
  }
}
