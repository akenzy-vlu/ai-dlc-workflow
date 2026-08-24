import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Actions, filters, anything that belongs on the same line as the title. */
  extra?: ReactNode;
}

export type PageHeaderViewProps = PageHeaderProps;
