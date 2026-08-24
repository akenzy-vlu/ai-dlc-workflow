import type { DirectoryListing } from '@domain/entities';

export interface FolderPickerProps {
  open: boolean;
  /** Where to start. Falls back to the API's first browse root when empty. */
  startAt?: string;
  /** Shown as the modal title, so the same picker serves "add" and "scan". */
  title?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onPick: (absolutePath: string) => void;
}

export interface FolderPickerViewProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  listing: DirectoryListing | undefined;
  loading: boolean;
  error: string | null;
  /** The folder currently being viewed — what "Use this folder" would pick. */
  current: string | undefined;
  nativeAvailable: boolean;
  nativePending: boolean;
  onNavigate: (absolutePath: string) => void;
  onUp: () => void;
  onOpenNative: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}
