import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Card, Input, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { accent, GATE_COLORS, ink, MONO_FONT, semantic, token } from '@app/theme';
import type { FeatureSummary } from '@domain/entities';
import { formatHours } from '@domain/value-objects';
import { GateTag } from '@presentation/components/gate-tag';
import { PageHeader } from '@presentation/components/page-header';
import { StatTile } from '@presentation/components/stat-tile';
import { TicketProgress } from '@presentation/components/ticket-progress';
import { DisplayControl, FilterControl } from '@presentation/features/view-controls';
import { formatRelative } from '@shared/lib/format';
import { PORTFOLIO_SCHEMA } from './portfolio-page.model';
import type { PortfolioPageViewProps } from './portfolio-page.props';

/**
 * Every feature in every repository, one row each.
 *
 * The question no single plan file answers. The columns make three things hard to miss:
 * where the portfolio piles up (gate), what it would cost to finish (critical path, not
 * effort — parallelism does not shorten a chain), and where a plan has drifted out of the
 * controller's reach (unmanaged).
 */
export function PortfolioPageView({
  portfolio,
  rows,
  groups,
  facets,
  filters,
  display,
  isCustomised,
  loading,
  fetching,
  search,
  onSearchChange,
  onFiltersChange,
  onDisplayChange,
  onResetView,
  onToggleGate,
  onRefresh,
}: PortfolioPageViewProps) {
  const shows = (key: string): boolean => display.properties.includes(key);
  const summary = portfolio?.summary;

  /**
   * Columns the Display panel can turn off.
   *
   * Built as a keyed list and filtered once rather than as inline spreads inside the array
   * literal — the spread form works but makes every column's presence conditional on a
   * ternary three lines above it, which is how a column ends up in the wrong place.
   */
  const optional: Record<string, ColumnsType<FeatureSummary>[number]> = {
    branch: {
      title: 'Branch',
      dataIndex: 'branch',
      width: 130,
      render: (branch: string | null) =>
        branch ? (
          <span style={{ fontFamily: MONO_FONT, fontSize: 11.5, color: token.textSecondary }}>{branch}</span>
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
    ready: {
      title: 'Ready',
      dataIndex: 'readyTicketCount',
      width: 80,
      align: 'right',
      sorter: (a, b) => a.readyTicketCount - b.readyTicketCount,
      render: (value: number, row) =>
        !row.managed || !row.nextGate ? (
          <span style={{ color: token.textMuted }}>—</span>
        ) : value > 0 ? (
          <Tag style={{ marginInlineEnd: 0, background: token.bgRaised, borderColor: token.border, color: token.textSecondary }}>
            {value}
          </Tag>
        ) : (
          <span style={{ color: token.textMuted }}>0</span>
        ),
    },
    review: {
      title: 'Review',
      dataIndex: 'ticketsInReview',
      width: 80,
      align: 'right',
      sorter: (a, b) => a.ticketsInReview - b.ticketsInReview,
      render: (value: number) =>
        value > 0 ? (
          <Tag style={{ marginInlineEnd: 0, color: accent.text, background: token.bgAccentSoft, borderColor: accent.fill }}>
            {value}
          </Tag>
        ) : (
          <span style={{ color: token.textMuted }}>0</span>
        ),
    },
    critical: {
      title: 'Critical path',
      dataIndex: 'criticalPathHours',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.criticalPathHours - b.criticalPathHours,
      render: (hours: number, row) => (
        <Tooltip title={`Total effort ${formatHours(row.effortHours)} — parallelism cannot shorten the chain below this`}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatHours(hours)}</span>
        </Tooltip>
      ),
    },
    remaining: {
      title: 'Left',
      dataIndex: 'remainingHours',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.remainingHours - b.remainingHours,
      render: (hours: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatHours(hours)}</span>,
    },
    blocked: {
      title: 'Blocked by',
      dataIndex: 'blockingAssumptionsOpen',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.blockingAssumptionsOpen - b.blockingAssumptionsOpen,
      render: (value: number) =>
        value > 0 ? (
          <Tooltip title="Blocking assumptions nobody has answered">
            <Tag style={{ marginInlineEnd: 0, color: accent.text, background: token.bgAccentSoft, borderColor: accent.fill }}>
              {value}
            </Tag>
          </Tooltip>
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
    coverage: {
      // Shown as covered/total rather than as a bare gap number: a lone "22" under a
      // column called "AC gap" reads as twenty-two problems when it is the opposite.
      title: 'AC covered',
      dataIndex: 'acceptanceCriteriaUncovered',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.acceptanceCriteriaUncovered - b.acceptanceCriteriaUncovered,
      render: (uncovered: number, row) => {
        if (row.acceptanceCriteriaCount === 0) {
          return (
            <Tooltip title="No AC-nn ids in 02-requirements.md — G1 refuses a feature that promises nothing checkable">
              <span style={{ color: token.textMuted }}>none</span>
            </Tooltip>
          );
        }
        const covered = row.acceptanceCriteriaCount - uncovered;
        return (
          <Tooltip
            title={
              uncovered > 0
                ? `${uncovered} acceptance criterion(s) have no covering ticket — a hard G3 error`
                : 'Every acceptance criterion has at least one covering ticket'
            }
          >
            <Tag
              color={uncovered > 0 ? 'error' : 'success'}
              style={{ marginInlineEnd: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {covered}/{row.acceptanceCriteriaCount}
            </Tag>
          </Tooltip>
        );
      },
    },
    activity: {
      title: 'Last activity',
      dataIndex: 'lastActivityAt',
      width: 130,
      sorter: (a, b) => (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? ''),
      render: (value: string | null) => (
        <span style={{ fontSize: 12, color: token.textSecondary }}>{formatRelative(value)}</span>
      ),
    },
  };

  const columns: ColumnsType<FeatureSummary> = [
    {
      title: 'Feature',
      dataIndex: 'slug',
      fixed: 'left',
      width: 300,
      sorter: (a, b) => a.slug.localeCompare(b.slug),
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <Link
            to={ROUTES.feature(row.repositoryId, row.slug)}
            style={{ fontFamily: MONO_FONT, fontSize: 12.5, fontWeight: 500 }}
          >
            {row.slug}
          </Link>
          <div style={{ fontSize: 11, color: token.textSecondary }}>
            {row.projectLabel}
            {row.projectLabel !== row.repositoryLabel ? (
              <Tooltip title={`Checkout: ${row.repositoryLabel}${row.branch ? ` on ${row.branch}` : ''}`}>
                <span style={{ color: token.textMuted }}> · {row.repositoryLabel}</span>
              </Tooltip>
            ) : null}
            {row.plansLocalOnly ? (
              <Tooltip title="`.ai/` is not committed — this plan exists on this machine only">
                <WarningOutlined style={{ color: semantic.warning, marginLeft: 6 }} />
              </Tooltip>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: 'Gate',
      dataIndex: 'gate',
      width: 130,
      sorter: (a, b) => `${a.managed}${a.gate}`.localeCompare(`${b.managed}${b.gate}`),
      render: (_, row) => (
        <Space size={4}>
          <GateTag gate={row.gate} managed={row.managed} />
          {row.nextGateVerdict === 'pass' ? (
            <Tooltip title={`${row.nextGate} preconditions pass — it needs a human to approve it`}>
              <Tag style={{ marginInlineEnd: 0, color: accent.text, background: token.bgAccentSoft, borderColor: accent.fill }}>
                → {row.nextGate}
              </Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Tickets',
      dataIndex: 'ticketsDone',
      width: 150,
      sorter: (a, b) => a.progress - b.progress,
      render: (_, row) =>
        row.ticketCount === 0 ? (
          <span style={{ color: token.textMuted }}>—</span>
        ) : (
          <Space orientation="vertical" size={0} style={{ width: '100%' }}>
            <TicketProgress done={row.ticketsDone} total={row.ticketCount} />
            <Progress
              percent={Math.round(row.progress * 100)}
              size="small"
              showInfo={false}
              // Progress is not an achievement to celebrate in colour; it fills with
              // graphite and only reads as finished when it is.
              strokeColor={row.progress === 1 ? semantic.success : ink[500]}
            />
          </Space>
        ),
    },
    ...Object.entries(optional)
      .filter(([key]) => shows(key))
      .map(([, column]) => column),
  ];

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle="Every feature under AI-DLC, across every tracked repository. Derived from the plan files; delete this and rescan, and it is identical."
        extra={
          <Space size={6}>
            <Input.Search
              allowClear
              placeholder="Find a feature"
              style={{ width: 200 }}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <DisplayControl
              schema={PORTFOLIO_SCHEMA}
              display={display}
              onChange={onDisplayChange}
              onReset={onResetView}
              isCustomised={isCustomised}
            />
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={onRefresh}>
              Refresh
            </Button>
          </Space>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <FilterControl facets={facets} filters={filters} onChange={onFiltersChange} />
      </div>

      {summary ? (
        <Space wrap size={10} style={{ marginBottom: 16 }}>
          <StatTile
            label="Projects"
            value={summary.projects}
            hint={`${summary.repositories} checkouts — clones and worktrees of one repo count once`}
          />
          <StatTile
            label="Features"
            value={summary.features}
            hint={`${summary.managedFeatures} under the controller, ${summary.unmanagedFeatures} not`}
          />
          <StatTile
            label="Unmanaged"
            value={summary.unmanagedFeatures}
            tone={summary.unmanagedFeatures > 0 ? 'warn' : 'neutral'}
            hint="Plan directories with no .aidlc-state.yaml — no gate was ever checked for them"
            onClick={() => onToggleGate('unmanaged')}
          />
          <StatTile
            label="Pickable now"
            value={summary.ticketsReady}
            tone={summary.ticketsReady > 0 ? 'good' : 'neutral'}
            hint="Tickets whose dependencies are done, in features past G3"
          />
          <StatTile
            label="In review"
            value={summary.ticketsInReview}
            tone={summary.ticketsInReview > 0 ? 'bad' : 'neutral'}
            hint="Handed off, waiting for someone other than the implementer"
          />
          <StatTile
            label="Blocking assumptions"
            value={summary.blockingAssumptionsOpen}
            tone={summary.blockingAssumptionsOpen > 0 ? 'bad' : 'good'}
            hint="Unanswered questions that hold G1 shut"
          />
          <StatTile
            label="Work left"
            value={formatHours(summary.remainingHours)}
            hint="Sum of unfinished ticket estimates in open features"
          />
        </Space>
      ) : null}

      {summary ? (
        <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '10px 14px' } }}>
          <Space size={6} wrap>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Where it piles up:
            </Typography.Text>
            {Object.entries(summary.gateHistogram)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([gate, count]) => (
                <Tag
                  key={gate}
                  style={{
                    cursor: 'pointer',
                    color: GATE_COLORS[gate],
                    background: token.bgRaised,
                    borderColor: token.border,
                    borderStyle: gate === 'unmanaged' ? 'dashed' : 'solid',
                  }}
                  onClick={() => onToggleGate(gate)}
                >
                  {gate} · {count}
                </Tag>
              ))}
            {filters.some((filter) => filter.property === 'gate') ? (
              <Button
                size="small"
                type="link"
                onClick={() => onFiltersChange(filters.filter((filter) => filter.property !== 'gate'))}
              >
                clear
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {display.groupBy === 'none' ? (
        <Table<FeatureSummary>
          rowKey={(row) => `${row.repositoryId}/${row.slug}`}
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1360 }}
          pagination={{ pageSize: 30, showSizeChanger: true, showTotal: (total) => `${total} features` }}
        />
      ) : (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {groups.map((group) => (
            <div key={group.key}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {group.label}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                  {group.rows.length} features ·{' '}
                  {formatHours(group.rows.reduce((total, row) => total + row.remainingHours, 0))} left
                </Typography.Text>
              </div>
              <Table<FeatureSummary>
                rowKey={(row) => `${row.repositoryId}/${row.slug}`}
                size="small"
                dataSource={group.rows}
                columns={columns}
                scroll={{ x: 1360 }}
                pagination={false}
              />
            </div>
          ))}
        </Space>
      )}
    </>
  );
}
