import type { ReactNode } from 'react';

export interface EmptyHintProps {
  title: string;
  hint?: string;
  action?: ReactNode;
}

export type EmptyHintViewProps = EmptyHintProps;
