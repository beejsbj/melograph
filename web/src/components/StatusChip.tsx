import type { ReactNode } from 'react';

export function StatusChip({ tone = 'muted', children }: { tone?: 'live' | 'muted' | 'ready'; children: ReactNode }) {
  return <span className={`status-chip status-chip--${tone}`}>{children}</span>;
}
