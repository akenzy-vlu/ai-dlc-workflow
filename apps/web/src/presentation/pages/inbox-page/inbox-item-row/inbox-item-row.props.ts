import type { InboxItem } from '@domain/entities';

export interface InboxItemRowProps {
  item: InboxItem;
  last: boolean;
}

export interface InboxItemRowViewProps extends InboxItemRowProps {
  featurePath: string | null;
}
