import type { SearchHit } from '@domain/entities';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export interface CommandPaletteViewProps {
  open: boolean;
  term: string;
  hits: SearchHit[];
  cursor: number;
  searching: boolean;
  /** Below this the query is not sent at all — one letter matches a whole portfolio. */
  belowMinimum: boolean;
  onTermChange: (term: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onHover: (index: number) => void;
  onSelect: (hit: SearchHit) => void;
  onClose: () => void;
}
