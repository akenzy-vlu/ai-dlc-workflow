import { useState } from 'react';
import { Space, Tag, Typography } from 'antd';

import { MONO_FONT, TERMINAL, token } from '@app/theme';
import { formatDateTime } from '@shared/lib/format';
import type { AgentThreadViewProps, ThreadEntryViewProps } from './agent-thread.props';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/**
 * A count, or the fact that none was reported.
 *
 * Never renders a missing count as `0`. Zero is a number a run reported — a run that read
 * no cache — and showing the two the same way tells someone a paid run was free.
 */
function tokens(value: number | null | undefined): string {
  return typeof value === 'number' ? compact.format(value) : 'not reported';
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};

/** Longer than this, an initial brief is not something to read inline. */
const COLLAPSE_OVER = 400;

export function AgentThreadView({ loading, empty, follow, bodyRef, onScroll, onFollowAgain, children }: AgentThreadViewProps) {
  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>
      <div
        ref={bodyRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {loading ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            loading…
          </Typography.Text>
        ) : empty ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            no agent has worked on this ticket yet
          </Typography.Text>
        ) : (
          children
        )}
      </div>

      {!follow ? (
        <button
          type="button"
          onClick={onFollowAgain}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 16,
            padding: '5px 12px',
            borderRadius: 999,
            border: 'none',
            background: 'rgba(247, 245, 240, 0.94)',
            boxShadow: 'var(--shadow-float, 0 2px 10px rgba(0,0,0,0.2))',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}

/**
 * One run, as a conversation turn.
 *
 * A reply's `promptPreview` is the message itself — short, and shown as sent text. A first
 * launch's `promptPreview` is the whole brief, which can run to several kilobytes; that one
 * is collapsed by default, never expanded automatically, because reading a brief is a
 * deliberate act and scrolling past one by accident is not what "read the thread" means.
 */
/** For `tool`, the tool's name and its one worth-showing argument; otherwise its text. */
function describeActivity(activity: { kind: string; tool?: string; detail?: string; text?: string }): string {
  if (activity.kind !== 'tool') return (activity.text ?? '').slice(0, 120);
  return activity.detail ? `${activity.tool} — ${activity.detail}` : (activity.tool ?? 'tool');
}

export function ThreadEntryView({ run, lines, currentActivity }: ThreadEntryViewProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const collapsible = !run.isReply && run.promptPreview.length > COLLAPSE_OVER;

  return (
    <div style={{ border: `1px solid ${token.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          padding: '8px 12px',
          background: token.bgRaised,
          borderBottom: `1px solid ${token.border}`,
        }}
      >
        <Space size={8} wrap>
          <Tag color={STATUS_COLOR[run.status]} style={{ marginInlineEnd: 0 }}>
            {run.status}
          </Tag>
          <span style={{ fontWeight: 500, fontSize: 12.5 }}>{run.agentLabel}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            via {run.launchedBy}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
            {formatDateTime(run.createdAt)}
          </Typography.Text>
          {run.isReply ? (
            <Tag style={{ marginInlineEnd: 0 }} color="default">
              reply
            </Tag>
          ) : null}
        </Space>
      </div>

      <div style={{ padding: '10px 12px' }}>
        {run.isReply ? (
          <div
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 13,
              padding: '6px 10px',
              borderRadius: 8,
              background: token.bgAccentSoft,
              display: 'inline-block',
              maxWidth: '100%',
            }}
          >
            {run.promptPreview}
          </div>
        ) : collapsible ? (
          <button
            type="button"
            onClick={() => setBriefOpen((v) => !v)}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              color: token.textSecondary,
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {briefOpen ? 'hide brief' : 'show brief'}
          </button>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, color: token.textSecondary }}>
            {run.promptPreview}
          </div>
        )}
        {collapsible && briefOpen ? (
          <div
            style={{
              marginTop: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
              color: token.textSecondary,
              fontFamily: MONO_FONT,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {run.promptPreview}
          </div>
        ) : null}
      </div>

      {run.telemetry?.sessionId || run.telemetry?.costUsd !== null || run.telemetry?.inputTokens !== null ? (
        <div style={{ padding: '0 12px 10px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {run.telemetry.sessionId ? (
            <Space size={6}>
              <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: token.textSecondary }}>
                {run.telemetry.sessionId.slice(0, 8)}
              </span>
              {run.isResumable ? (
                <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                  Resume available
                </Tag>
              ) : null}
            </Space>
          ) : null}
          {run.telemetry.costUsd !== null || run.telemetry.inputTokens !== null ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {run.telemetry.costUsd !== null ? `$${run.telemetry.costUsd.toFixed(4)} · ` : ''}
              in {tokens(run.telemetry.inputTokens)} · out {tokens(run.telemetry.outputTokens)} · cache-r{' '}
              {tokens(run.telemetry.cacheReadTokens)} · cache-w {tokens(run.telemetry.cacheWriteTokens)}
            </Typography.Text>
          ) : null}
        </div>
      ) : null}

      {currentActivity ? (
        <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: token.accentFill,
              display: 'inline-block',
              animation: 'aidlc-pulse 1.4s ease-in-out infinite',
            }}
          />
          <Typography.Text style={{ fontSize: 12, fontFamily: MONO_FONT }}>
            {describeActivity(currentActivity)}
          </Typography.Text>
        </div>
      ) : null}

      {run.suggestsSubmit ? (
        <Typography.Text type="secondary" style={{ fontSize: 11.5, padding: '0 12px 10px', display: 'block' }}>
          Finished cleanly. Not accepted — read the diff, then submit and accept the ticket yourself.
        </Typography.Text>
      ) : null}

      <div
        style={{
          background: TERMINAL.bg,
          padding: '10px 12px',
          fontFamily: MONO_FONT,
          fontSize: 11.5,
          lineHeight: 1.55,
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        {lines.length === 0 ? (
          <span style={{ color: TERMINAL.dim }}>waiting for output…</span>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${line.at}-${index}`}
              style={{
                color: line.stream === 'stderr' ? TERMINAL.stderr : line.stream === 'console' ? TERMINAL.notice : TERMINAL.text,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {line.text || ' '}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
