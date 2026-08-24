import { Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import type { RepoTagViewProps } from './repo-tag.props';

export function RepoTagView({ id, label }: RepoTagViewProps) {
  return (
    <Link to={`${ROUTES.repositories}#${id}`} style={{ textDecoration: 'none' }}>
      <Tag style={{ marginInlineEnd: 0, cursor: 'pointer' }}>{label}</Tag>
    </Link>
  );
}

export function LocalOnlyBadgeView() {
  return (
    <Tooltip title="`.ai/` is not committed — these plans and their approval trail exist on this machine only">
      <Tag color="warning" style={{ marginInlineEnd: 0 }}>
        local only
      </Tag>
    </Tooltip>
  );
}
