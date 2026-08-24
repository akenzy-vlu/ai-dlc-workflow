import { useMemo } from 'react';

import type { AuditPanelProps } from './audit-panel.props';
import { AuditPanelView } from './audit-panel.view';

export function AuditPanel({ history }: AuditPanelProps) {
  const entries = useMemo(() => [...history].reverse(), [history]);
  return <AuditPanelView entries={entries} />;
}
