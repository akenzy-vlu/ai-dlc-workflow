import { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  InboxOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { useAppSelector } from '@app/store';
import { agentRepository, insightRepository, runnerRepository } from '@data/repositories';
import { usePlanEvents } from '@presentation/features/plan-events';
import type { NavBadge, NavGroup } from './app-shell.props';
import { AppShellView } from './app-shell.view';

const NAV: NavGroup[] = [
  {
    label: 'Yours',
    items: [
      { key: ROUTES.inbox, icon: <InboxOutlined />, label: 'Inbox', badge: 'blockers' },
      { key: ROUTES.readyQueue, icon: <ThunderboltOutlined />, label: 'Pickable now' },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { key: ROUTES.board, icon: <AppstoreOutlined />, label: 'Board' },
      { key: ROUTES.portfolio, icon: <ApartmentOutlined />, label: 'Features' },
      { key: ROUTES.agentRuns, icon: <RobotOutlined />, label: 'Agent runs', badge: 'agents' },
      { key: ROUTES.audit, icon: <AuditOutlined />, label: 'Approval trail' },
    ],
  },
  {
    label: 'Configure',
    items: [
      { key: ROUTES.repositories, icon: <DatabaseOutlined />, label: 'Repositories' },
      { key: ROUTES.skills, icon: <DeploymentUnitOutlined />, label: 'Skills' },
      { key: ROUTES.setup, icon: <ToolOutlined />, label: 'Setup', badge: 'setup' },
    ],
  },
];

const MODIFIER =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);

  // One subscription for the whole app, mounted here.
  usePlanEvents();

  const inbox = insightRepository.useInbox();
  const activeRuns = agentRepository.useRuns({ active: true });
  const runner = runnerRepository.useRunner();
  const sweep = useAppSelector((state) => state.stream.gateSweep);

  const counts = useMemo<Record<NavBadge, number>>(
    () => ({
      blockers: inbox.data?.items.filter((item) => item.severity === 'blocker').length ?? 0,
      agents: activeRuns.data?.length ?? 0,
      // A single dot when the browser runner is missing. Silent otherwise: a badge that is
      // always lit is a badge nobody reads.
      setup: runner.data && !runner.data.ready ? 1 : 0,
    }),
    [inbox.data, activeRuns.data, runner.data],
  );

  // ⌘K anywhere, and `c` for a new feature when focus is not in a field. Two shortcuts
  // worth muscle memory; past that they start colliding with typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === 'c' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setNewFeatureOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedKey = location.pathname.startsWith('/features')
    ? ROUTES.portfolio
    : location.pathname === '/'
      ? ROUTES.inbox
      : `/${location.pathname.split('/')[1]}`;

  return (
    <AppShellView
      nav={NAV}
      selectedKey={selectedKey}
      counts={counts}
      modifierKey={MODIFIER}
      activeRuns={activeRuns.data ?? []}
      sweep={sweep}
      onNavigate={navigate}
      onOpenPalette={() => setPaletteOpen(true)}
      onOpenNewFeature={() => setNewFeatureOpen(true)}
      paletteOpen={paletteOpen}
      newFeatureOpen={newFeatureOpen}
      onClosePalette={() => setPaletteOpen(false)}
      onCloseNewFeature={() => setNewFeatureOpen(false)}
    />
  );
}
