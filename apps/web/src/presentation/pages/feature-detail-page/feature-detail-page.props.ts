import type { ControllerOutcome, FeatureDetail } from '@domain/entities';

export type FeatureTool = 'regenerate' | 'validate' | 'lintTouches';

export interface FeatureDetailPageViewProps {
  feature: FeatureDetail | undefined;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  activeTab: string;
  toolRunning: boolean;
  outcome: { title: string; result: ControllerOutcome } | null;
  document: { name: string; content: string } | undefined;
  documentLoading: boolean;
  openDocumentName: string | null;
  onTabChange: (tab: string) => void;
  onReload: () => void;
  onRunTool: (tool: FeatureTool) => void;
  onCloseOutcome: () => void;
  onOpenDocument: (name: string) => void;
  onCloseDocument: () => void;
}
