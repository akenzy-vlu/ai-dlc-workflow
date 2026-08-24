import type { ReactNode } from 'react';

import type { AgentRun } from '@domain/entities';

export type NavBadge = 'blockers' | 'agents' | 'setup';

export interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
  badge?: NavBadge;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface AppShellViewProps {
  nav: NavGroup[];
  selectedKey: string;
  counts: Record<NavBadge, number>;
  modifierKey: string;
  activeRuns: AgentRun[];
  sweep: { done: number; total: number } | null;
  onNavigate: (key: string) => void;
  onOpenPalette: () => void;
  onOpenNewFeature: () => void;
  paletteOpen: boolean;
  newFeatureOpen: boolean;
  onClosePalette: () => void;
  onCloseNewFeature: () => void;
}
