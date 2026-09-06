import { useState } from 'react';
import { App } from 'antd';

import { ROUTES } from '@app/router/routes';
import { agentRepository, preferencesRepository } from '@data/repositories';
import type { ReplyComposerProps } from './reply-composer.props';
import { ReplyComposerView } from './reply-composer.view';

/**
 * Kept once acknowledged this browser session — not persisted, so a fresh page load asks
 * again, the same way a fresh page load re-shows nothing else about a run either. A module
 * set rather than a redux slice: this is a UI nicety, not state anything else reads.
 */
const acknowledgedThisSession = new Set<string>();

/**
 * Replies to whichever run in this ticket's thread can currently be resumed.
 *
 * Fetches the thread itself, the same way `AgentThread` does — RTK Query's cache means a
 * second subscriber to the same query costs nothing extra, and it keeps this component a
 * true drop-in that only needs a ticket reference.
 */
export function ReplyComposer({ repositoryId, slug, ticketId }: ReplyComposerProps) {
  const { message } = App.useApp();
  const { actor } = preferencesRepository.useActor();
  const thread = agentRepository.useThread({ repositoryId, slug }, ticketId);
  const reply = agentRepository.useReply();

  const [value, setValue] = useState('');
  const [acknowledged, setAcknowledged] = useState(() => acknowledgedThisSession.has(ticketId));

  const replyTo = thread.data?.replyTo ?? null;
  const canReply = (thread.data?.canReply ?? false) && replyTo !== null;

  const send = (): void => {
    const message_ = value.trim();
    if (!message_ || !replyTo || !canReply) return;
    void reply
      .run({ runId: replyTo, message: message_, repliedBy: actor, acknowledged: true })
      .then(() => setValue(''))
      .catch((error: Error) => message.error(error.message));
  };

  return (
    <ReplyComposerView
      value={value}
      onChange={setValue}
      onSend={send}
      sending={reply.isPending}
      canReply={canReply}
      cannotReplyReason={thread.data?.cannotReplyReason ?? null}
      launchFreshHref={`${ROUTES.feature(repositoryId, slug)}?ticket=${ticketId}`}
      acknowledged={acknowledged}
      onAcknowledge={() => {
        acknowledgedThisSession.add(ticketId);
        setAcknowledged(true);
      }}
    />
  );
}
