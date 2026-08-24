import { ROUTES } from '@app/router/routes';
import type { InboxItemRowProps } from './inbox-item-row.props';
import { InboxItemRowView } from './inbox-item-row.view';

export function InboxItemRow({ item, last }: InboxItemRowProps) {
  return (
    <InboxItemRowView
      item={item}
      last={last}
      featurePath={item.featureSlug ? ROUTES.feature(item.repositoryId, item.featureSlug) : null}
    />
  );
}
