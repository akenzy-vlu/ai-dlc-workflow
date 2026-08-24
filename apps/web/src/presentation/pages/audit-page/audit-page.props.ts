import type { AuditRow, Repository } from '@domain/entities';

export interface AuditPageViewProps {
  rows: AuditRow[];
  loading: boolean;
  repositories: Repository[];
  repositoryId: string | undefined;
  onRepositoryChange: (repositoryId: string | undefined) => void;
}
