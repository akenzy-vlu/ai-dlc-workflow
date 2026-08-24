import { LoadingOutlined } from '@ant-design/icons';
import { Popover, Tag } from 'antd';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { MONO_FONT, token } from '@app/theme';
import type { AgentsWorkingPillViewProps } from './agents-working-pill.props';

/**
 * How many agents are working right now, and on what.
 *
 * The detail matters for a duller reason than it looks: an agent is editing files in a
 * real checkout, and a person about to open that repository in an editor should be able
 * to see that at a glance.
 */
export function AgentsWorkingPillView({ runs }: AgentsWorkingPillViewProps) {
  if (runs.length === 0) return null;

  return (
    <Popover
      placement="bottomRight"
      content={
        <div style={{ maxWidth: 340 }}>
          {runs.map((run) => (
            <Link
              key={run.id}
              to={`${ROUTES.agentRuns}?run=${run.id}`}
              style={{ display: 'block', padding: '5px 0', borderBottom: `1px solid ${token.border}` }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: MONO_FONT, fontSize: 11.5, fontWeight: 500 }}>
                  {run.ticketId}
                </span>
                <Tag style={{ marginInlineEnd: 0, fontSize: 10.5 }}>{run.agentLabel}</Tag>
              </div>
              <div style={{ fontSize: 11, color: token.textSecondary }}>
                {run.repositoryLabel} · {run.slug} · {run.lineCount} lines
              </div>
            </Link>
          ))}
        </div>
      }
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 999,
          border: `1px solid ${token.border}`,
          background: token.bgRaised,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {/* An agent mid-run is activity, not attention: neutral, never the accent. */}
        <LoadingOutlined style={{ color: token.textSecondary, fontSize: 11 }} />
        <strong style={{ fontWeight: 500 }}>{runs.length}</strong>
        <span style={{ color: token.textSecondary }}>
          {runs.length === 1 ? 'agent working' : 'agents working'}
        </span>
      </span>
    </Popover>
  );
}
