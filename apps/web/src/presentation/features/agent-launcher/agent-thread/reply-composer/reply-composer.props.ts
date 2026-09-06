export interface ReplyComposerProps {
  repositoryId: string;
  slug: string;
  ticketId: string;
}

export interface ReplyComposerViewProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  /** Resolved server-side, in `reply()` — never re-derived here. */
  canReply: boolean;
  /** Shown verbatim whenever `canReply` is false. */
  cannotReplyReason: string | null;
  /** Where "launch a fresh run instead" sends the person — the ticket's own page. */
  launchFreshHref: string;
  /** True once this browser session has seen the acknowledgement, on any reply. */
  acknowledged: boolean;
  onAcknowledge: () => void;
}
