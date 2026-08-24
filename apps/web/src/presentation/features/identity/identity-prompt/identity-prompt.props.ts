export interface IdentityPromptProps {
  open: boolean;
  onClose: () => void;
}

export interface IdentityPromptViewProps {
  open: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}
