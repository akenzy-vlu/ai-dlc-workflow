import type { EmptyHintProps } from './empty-hint.props';
import { EmptyHintView } from './empty-hint.view';

export function EmptyHint(props: EmptyHintProps) {
  return <EmptyHintView {...props} />;
}
