import { AlertOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Segmented, Select, Space, Spin, Tag } from 'antd';

import { ink, SEVERITY_COLORS, token } from '@app/theme';
import { INBOX_KIND_LABELS } from '@domain/enums';
import { PageHeader } from '@presentation/components/page-header';
import { InboxItemRow } from './inbox-item-row';
import type { InboxPageViewProps, SeverityTab } from './inbox-page.props';

/**
 * Everything in the portfolio that is stopped and waiting on a person.
 *
 * Progress is deliberately absent. A list that mixes "twelve tickets moved" with "four
 * plans cannot start" trains you to skim it, and then the four stop being noticed.
 */
export function InboxPageView({
  loading,
  fetching,
  severity,
  counts,
  grouped,
  repositories,
  repositoryId,
  featuresWithoutGateCheck,
  sweeping,
  onSeverityChange,
  onRepositoryChange,
  onRefresh,
  onSweep,
}: InboxPageViewProps) {
  return (
    <>
      <PageHeader
        title="Waiting on a human"
        subtitle="Nothing here moves on its own. Each item is a decision only a person can make."
        extra={
          <Space>
            <Select
              allowClear
              placeholder="All repositories"
              style={{ width: 200 }}
              value={repositoryId}
              onChange={onRepositoryChange}
              options={repositories.map((repository) => ({
                value: repository.id,
                label: repository.label,
              }))}
            />
            <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={fetching}>
              Refresh
            </Button>
          </Space>
        }
      />

      {featuresWithoutGateCheck > 0 ? (
        <Alert
          type="info"
          showIcon
          icon={<ThunderboltOutlined />}
          style={{ marginBottom: 16 }}
          message={`${featuresWithoutGateCheck} feature(s) have never had their next gate checked`}
          description="A gate verdict costs a controller subprocess, so the console reports only what it has actually run rather than guessing. Sweep to fill the gaps — it runs in the background."
          action={
            <Button size="small" type="primary" loading={sweeping} onClick={onSweep}>
              Sweep gates
            </Button>
          }
        />
      ) : null}

      <Segmented
        style={{ marginBottom: 16 }}
        value={severity}
        onChange={(value) => onSeverityChange(value as SeverityTab)}
        options={[
          { value: 'blocker', label: <SegmentLabel text="Blockers" count={counts.blocker} tone={SEVERITY_COLORS.blocker} /> },
          { value: 'attention', label: <SegmentLabel text="Needs attention" count={counts.attention} tone={SEVERITY_COLORS.attention} /> },
          { value: 'hygiene', label: <SegmentLabel text="Hygiene" count={counts.hygiene} tone={SEVERITY_COLORS.hygiene} /> },
          { value: 'all', label: <SegmentLabel text="Everything" count={counts.all} tone={ink[400]} /> },
        ]}
      />

      {loading ? (
        <Spin />
      ) : grouped.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              severity === 'blocker'
                ? 'Nothing is blocked. Every plan that can move is moving.'
                : 'Nothing at this level.'
            }
          />
        </Card>
      ) : (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {grouped.map(([kind, items]) => (
            <Card
              key={kind}
              size="small"
              title={
                <Space>
                  <AlertOutlined style={{ color: SEVERITY_COLORS[items[0].severity] }} />
                  <span>{INBOX_KIND_LABELS[kind]}</span>
                  <Tag>{items.length}</Tag>
                </Space>
              }
              styles={{ body: { padding: 0 } }}
            >
              {items.map((item, index) => (
                <InboxItemRow key={item.id} item={item} last={index === items.length - 1} />
              ))}
            </Card>
          ))}
        </Space>
      )}
    </>
  );
}

/** A count badge overlaid on a segment label collides with the text; this sits beside it. */
function SegmentLabel({ text, count, tone }: { text: string; count: number; tone: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span>{text}</span>
      <span
        style={{
          minWidth: 18,
          padding: '0 5px',
          borderRadius: 999,
          fontSize: 10.5,
          lineHeight: '16px',
          fontVariantNumeric: 'tabular-nums',
          color: count > 0 ? 'var(--on-accent)' : token.textSecondary,
          background: count > 0 ? tone : 'var(--gp-100)',
        }}
      >
        {count}
      </span>
    </span>
  );
}
