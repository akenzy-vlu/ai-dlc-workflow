import { useState } from 'react';

import { preferencesRepository } from '@data/repositories';
import type { ActorButtonProps } from './actor-button.props';
import { ActorButtonView } from './actor-button.view';

export function ActorButton({ emptyLabel = 'Set your name' }: ActorButtonProps) {
  const { actor } = preferencesRepository.useActor();
  const [open, setOpen] = useState(false);

  return (
    <ActorButtonView
      label={actor || emptyLabel}
      hasActor={Boolean(actor)}
      onOpen={() => setOpen(true)}
      promptOpen={open}
      onClosePrompt={() => setOpen(false)}
    />
  );
}
