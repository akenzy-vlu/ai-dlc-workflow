import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { insightRepository } from '@data/repositories';
import type { SearchHit } from '@domain/entities';
import type { CommandPaletteProps } from './command-palette.props';
import { CommandPaletteView } from './command-palette.view';

const MIN_TERM_LENGTH = 2;
const DEBOUNCE_MS = 140;

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cursor, setCursor] = useState(0);

  const results = insightRepository.useSearch(debounced);
  const hits = results.data ?? [];

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!open) {
      setTerm('');
      setDebounced('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => setCursor(0), [hits]);

  const select = (hit: SearchHit): void => {
    navigate(hit.path);
    onClose();
  };

  return (
    <CommandPaletteView
      open={open}
      term={term}
      hits={hits}
      cursor={cursor}
      searching={results.isFetching}
      belowMinimum={debounced.trim().length < MIN_TERM_LENGTH}
      onTermChange={setTerm}
      onHover={setCursor}
      onSelect={select}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCursor((current) => Math.min(current + 1, hits.length - 1));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCursor((current) => Math.max(current - 1, 0));
        } else if (event.key === 'Enter' && hits[cursor]) {
          event.preventDefault();
          select(hits[cursor]);
        }
      }}
    />
  );
}
