import type { RepoTagProps } from './repo-tag.props';
import { LocalOnlyBadgeView, RepoTagView } from './repo-tag.view';

export function RepoTag(props: RepoTagProps) {
  return <RepoTagView {...props} />;
}

export function LocalOnlyBadge() {
  return <LocalOnlyBadgeView />;
}
