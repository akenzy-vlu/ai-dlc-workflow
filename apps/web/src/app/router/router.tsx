import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@presentation/layout/app-shell';
import { AgentRunsPage } from '@presentation/pages/agent-runs-page';
import { AuditPage } from '@presentation/pages/audit-page';
import { BoardPage } from '@presentation/pages/board-page';
import { FeatureDetailPage } from '@presentation/pages/feature-detail-page';
import { InboxPage } from '@presentation/pages/inbox-page';
import { PortfolioPage } from '@presentation/pages/portfolio-page';
import { ReadyQueuePage } from '@presentation/pages/ready-queue-page';
import { RepositoriesPage } from '@presentation/pages/repositories-page';
import { SetupPage } from '@presentation/pages/setup-page';
import { SkillsPage } from '@presentation/pages/skills-page';
import { ROUTES } from './routes';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // The inbox is home. Opening on the portfolio answers "what exists" when the
      // question people arrive with is "what is waiting on me".
      { index: true, element: <Navigate to={ROUTES.inbox} replace /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'ready', element: <ReadyQueuePage /> },
      { path: 'board', element: <BoardPage /> },
      { path: 'portfolio', element: <PortfolioPage /> },
      { path: 'agent-runs', element: <AgentRunsPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'repositories', element: <RepositoriesPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'setup', element: <SetupPage /> },
      { path: 'features/:repositoryId/:slug', element: <FeatureDetailPage /> },
    ],
  },
]);
