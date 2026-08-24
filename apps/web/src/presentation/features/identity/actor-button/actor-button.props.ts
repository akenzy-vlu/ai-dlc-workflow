export interface ActorButtonProps {
  /** Rendered instead of the button when no name is set yet. */
  emptyLabel?: string;
}

export interface ActorButtonViewProps {
  label: string;
  hasActor: boolean;
  onOpen: () => void;
  promptOpen: boolean;
  onClosePrompt: () => void;
}
