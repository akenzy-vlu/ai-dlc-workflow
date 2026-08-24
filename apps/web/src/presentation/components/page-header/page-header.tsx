import type { PageHeaderProps } from './page-header.props';
import { PageHeaderView } from './page-header.view';

export function PageHeader(props: PageHeaderProps) {
  return <PageHeaderView {...props} />;
}
