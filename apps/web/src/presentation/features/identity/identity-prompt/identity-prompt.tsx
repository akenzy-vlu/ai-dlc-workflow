import { useEffect, useState } from 'react';

import { preferencesRepository } from '@data/repositories';
import type { IdentityPromptProps } from './identity-prompt.props';
import { IdentityPromptView } from './identity-prompt.view';

/**
 * Asks for a name before the first write.
 *
 * Not decoration: `aidlc pass G3 --by <name>` puts that string in an append-only trail
 * that outlives the session, and on repositories that do not commit `.ai/` it is the only
 * record that a person approved anything.
 */
export function IdentityPrompt({ open, onClose }: IdentityPromptProps) {
  const { actor, setActor } = preferencesRepository.useActor();
  const [draft, setDraft] = useState(actor);

  // Re-seed each time it opens, so cancelling does not leave a stale draft behind.
  useEffect(() => {
    if (open) setDraft(actor);
  }, [open, actor]);

  return (
    <IdentityPromptView
      open={open}
      draft={draft}
      onDraftChange={setDraft}
      onConfirm={() => {
        setActor(draft);
        onClose();
      }}
      onCancel={onClose}
    />
  );
}
