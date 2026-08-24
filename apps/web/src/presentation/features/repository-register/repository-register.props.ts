import type { DiscoveredRepository } from '@domain/entities';

export interface RepositoryRegisterViewProps {
  open: boolean;
  path: string;
  root: string;
  found: DiscoveredRepository[];
  adding: boolean;
  scanning: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPathChange: (value: string) => void;
  onRootChange: (value: string) => void;
  onAdd: (absolutePath: string) => void;
  onScan: () => void;
  /** Which field the folder picker is filling, or null when it is closed. */
  browsing: 'path' | 'root' | null;
  onBrowse: (field: 'path' | 'root') => void;
  onBrowseCancel: () => void;
  onBrowsePick: (absolutePath: string) => void;
}
