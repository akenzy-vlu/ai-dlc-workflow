import { BranchesOutlined, NodeIndexOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';

import { MONO_FONT, token } from '@app/theme';
import type { TicketCardViewProps } from './ticket-card.props';

export function TicketCardView({
  card,
  run,
  ticketPath,
  waiting,
  working,
  checkoutSummary,
  shows,
  onLaunch,
  onOpenRun,
}: TicketCardViewProps) {
  return (
    <article
      style={{
        background: token.bgSurface,
        border: `1px solid ${token.border}`,
        // Weight, not hue. Amber is reserved for "a person must look at this", and a
        // critical-path ticket is not that — it is the one that sets the date.
        borderLeft: `3px solid ${card.onCriticalPath ? token.borderStrong : 'transparent'}`,
        borderRadius: 8,
        padding: '9px 10px',
        boxShadow: 'var(--shadow-card, 0 1px 2px rgba(28, 26, 24, 0.05))',
        opacity: waiting ? 0.62 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <Link to={ticketPath} style={{ fontFamily: MONO_FONT, fontSize: 11.5, fontWeight: 500 }}>
          {card.ticketId}
        </Link>
        {working && run ? (
          <Tooltip title={`${run.agentLabel} is working on this`}>
            <Tag
              // An agent mid-run is activity, not attention.
              style={{
                marginInlineEnd: 0,
                fontSize: 10,
                padding: '0 5px',
                cursor: 'pointer',
                background: token.bgRaised,
                borderColor: token.borderStrong,
                color: token.textSecondary,
              }}
              onClick={() => onOpenRun(run.id)}
            >
              working
            </Tag>
          </Tooltip>
        ) : null}
        {card.checkouts.length > 1 && !card.diverged ? (
          <Tooltip title={checkoutSummary}>
            <span
              style={{ fontSize: 10, color: token.textMuted, display: 'inline-flex', alignItems: 'center', gap: 2 }}
            >
              <BranchesOutlined />
              {card.checkouts.length}
            </span>
          </Tooltip>
        ) : null}
        {shows('estimate') ? (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: token.textMuted }}>{card.estimateLabel}</span>
        ) : null}
      </div>

      <div style={{ fontSize: 12.5, color: token.textPrimary, lineHeight: 1.4, marginBottom: 6 }}>
        {card.title}
      </div>

      {/* Divergence gets a loud tag; agreement gets a glyph beside the id. Being in two
          checkouts is the norm for a multi-clone project, and a full-width tag on every
          card would be the loudest thing on a board where it means nothing. */}
      {card.diverged ? (
        <Tooltip title={checkoutSummary}>
          <Tag color="warning" style={{ marginInlineEnd: 0, marginBottom: 5, fontSize: 10.5 }}>
            checkouts disagree
          </Tag>
        </Tooltip>
      ) : null}

      {shows('feature') || shows('branch') ? (
        <div style={{ fontSize: 10.5, color: token.textMuted, marginBottom: 5, fontFamily: MONO_FONT }}>
          {shows('feature') ? card.featureSlug : null}
          {shows('feature') && shows('branch') && card.branch ? ' · ' : null}
          {shows('branch') ? card.branch : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {shows('layer') ? (
          <Tooltip title={card.layerDeclared ? undefined : 'Not in this repo’s declared layer vocabulary — a G3 error'}>
            <Tag color={card.layerDeclared ? undefined : 'error'} style={{ marginInlineEnd: 0, fontSize: 10.5 }}>
              {card.layer}
            </Tag>
          </Tooltip>
        ) : null}
        {shows('uow') && card.uowId ? (
          <span style={{ fontSize: 10.5, color: token.textMuted, fontFamily: MONO_FONT }}>{card.uowId}</span>
        ) : null}
        {card.onCriticalPath ? (
          <Tooltip title="On the critical path — an hour here is an hour on the finish date">
            <NodeIndexOutlined style={{ color: token.textSecondary, fontSize: 11 }} />
          </Tooltip>
        ) : null}
        {waiting ? (
          <Tooltip title={`${card.unmetDependencies} dependency(ies) not done`}>
            <Tag style={{ marginInlineEnd: 0, fontSize: 10.5 }}>waiting ×{card.unmetDependencies}</Tag>
          </Tooltip>
        ) : null}
        {shows('checklist') && card.status !== 'done' && card.untickedCount > 0 ? (
          <Tooltip title={`${card.untickedCount} done-when item(s) unticked — the controller refuses submit`}>
            <span style={{ fontSize: 10.5, color: token.textMuted }}>☐{card.untickedCount}</span>
          </Tooltip>
        ) : null}

        {card.ready && !working ? (
          <Tooltip title="Dependencies satisfied — hand it to an agent">
            <Button
              size="small"
              type="text"
              icon={<RobotOutlined />}
              onClick={onLaunch}
              style={{ marginLeft: 'auto', fontSize: 11, height: 22, color: token.textSecondary }}
            />
          </Tooltip>
        ) : run ? (
          <Button
            size="small"
            type="text"
            onClick={() => onOpenRun(run.id)}
            style={{ marginLeft: 'auto', fontSize: 10.5, height: 22, color: token.textMuted }}
          >
            run log
          </Button>
        ) : null}
      </div>
    </article>
  );
}
