import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Select, Space, Spin, Switch, Tooltip } from 'antd';

import { token } from '@app/theme';
import { PageHeader } from '@presentation/components/page-header';
import { AgentRunDrawer, LaunchAgentModal } from '@presentation/features/agent-launcher';
import { DisplayControl, FilterControl } from '@presentation/features/view-controls';
import { BOARD_SCHEMA } from './board-page.model';
import { BoardLane } from './board-lane';
import type { BoardPageViewProps } from './board-page.props';

/**
 * Every ticket in scope, as columns, with swimlanes.
 *
 * Deliberately not drag-and-drop. Every column boundary is a controller transition with
 * real preconditions — a done-when checklist, a dependency, a second pair of eyes — and a
 * card that slides across would either lie about what happened or snap back with an
 * error. The actions live on the card and each one says what it will do.
 */
export function BoardPageView({
  board,
  lanes,
  columns,
  projects,
  projectsLoading,
  scope,
  filters,
  display,
  isCustomised,
  loading,
  fetching,
  launchFor,
  openRunId,
  runFor,
  onScopeChange,
  onFiltersChange,
  onDisplayChange,
  onResetView,
  onRefresh,
  onLaunch,
  onOpenRun,
}: BoardPageViewProps) {
  const cards = board?.cards ?? [];

  return (
    <>
      <PageHeader
        title="Board"
        subtitle={
          board
            ? `${cards.length} of ${board.totalBeforeFilters} tickets · ${board.scopeLabel}`
            : 'Every ticket in scope, as columns.'
        }
        extra={
          <Space wrap size={6}>
            <Select
              showSearch
              style={{ width: 260 }}
              value={scope}
              onChange={onScopeChange}
              loading={projectsLoading}
              optionFilterProp="label"
              options={[
                { value: 'all', label: 'Everything' },
                ...projects.map((project) => ({
                  value: `project:${project.key}`,
                  label:
                    project.repositoryIds.length > 1
                      ? `${project.label} (${project.repositoryIds.length} checkouts)`
                      : project.label,
                })),
              ]}
            />
            <DisplayControl
              schema={BOARD_SCHEMA}
              display={display}
              onChange={onDisplayChange}
              onReset={onResetView}
              isCustomised={isCustomised}
              showBoardOptions
            />
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={onRefresh}>
              Refresh
            </Button>
          </Space>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <FilterControl facets={board?.facets ?? []} filters={filters} onChange={onFiltersChange} />
        <span style={{ marginLeft: 'auto' }}>
          <Tooltip title="Keeps a column visible even with nothing in it, so the shape stays stable across lanes">
            <Space size={6}>
              <Switch
                size="small"
                checked={display.showEmptyGroups}
                onChange={(showEmptyGroups) => onDisplayChange({ showEmptyGroups })}
              />
              <span style={{ fontSize: 12, color: token.textSecondary }}>Show empty lanes</span>
            </Space>
          </Tooltip>
        </span>
      </div>

      {loading ? (
        <Spin />
      ) : cards.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="Nothing matches"
          description={
            board && board.totalBeforeFilters > 0
              ? `${board.totalBeforeFilters} tickets are in scope; the active filters exclude all of them.`
              : 'No feature in this scope has passed G3, so construction is locked everywhere. That is the gate doing its job.'
          }
        />
      ) : (
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          {lanes.map((lane) => (
            <BoardLane
              key={lane.key}
              lane={lane}
              columns={columns}
              orderBy={display.orderBy}
              properties={display.properties}
              showEmptyColumns={display.showEmptyGroups}
              runFor={runFor}
              onLaunch={onLaunch}
              onOpenRun={(runId) => onOpenRun(runId)}
            />
          ))}
          {lanes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
        </Space>
      )}

      {launchFor ? (
        <LaunchAgentModal
          open
          onClose={() => onLaunch(null)}
          repositoryId={launchFor.repositoryId}
          slug={launchFor.featureSlug}
          ticketId={launchFor.ticketId}
          ticketTitle={launchFor.title}
          onLaunched={(runId) => onOpenRun(runId)}
        />
      ) : null}

      <AgentRunDrawer runId={openRunId} onClose={() => onOpenRun(null)} />
    </>
  );
}
