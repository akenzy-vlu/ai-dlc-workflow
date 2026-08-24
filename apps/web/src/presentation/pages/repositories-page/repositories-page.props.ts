import type { Repository, ToolingStatus } from '@domain/entities';

export interface RepositoriesPageViewProps {
  repositories: Repository[];
  loading: boolean;
  tooling: ToolingStatus | undefined;
  rescanning: boolean;
  onRescan: () => void;
  onRemove: (id: string) => void;
}
