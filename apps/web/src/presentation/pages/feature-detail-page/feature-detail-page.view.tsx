import { CodeOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Modal, Space, Spin, Tabs, Tag, Tooltip } from 'antd';

import { MONO_FONT, token } from '@app/theme';
import { formatHours } from '@domain/value-objects';
import { ControllerOutput } from '@presentation/components/controller-output';
import { GateTag } from '@presentation/components/gate-tag';
import { GateTimeline } from '@presentation/components/gate-timeline';
import { PageHeader } from '@presentation/components/page-header';
import { StatTile } from '@presentation/components/stat-tile';
import { GateActions } from '@presentation/features/gate-actions';
import { formatDateTime } from '@shared/lib/format';
import { AssumptionsPanel } from './assumptions-panel';
import { AuditPanel } from './audit-panel';
import { GateVerdictPanel } from './gate-verdict-panel';
import { GraphWaves } from './graph-waves';
import { IntentPanel } from './intent-panel';
import { TraceabilityPanel } from './traceability-panel';
import { UnitsOfWorkPanel } from './units-of-work-panel';
import { VerificationPanel } from './verification-panel';
import type { FeatureDetailPageViewProps } from './feature-detail-page.props';

export function FeatureDetailPageView({
  feature,
  loading,
  fetching,
  error,
  activeTab,
  toolRunning,
  outcome,
  document,
  openDocumentName,
  onTabChange,
  onReload,
  onRunTool,
  onCloseOutcome,
  onOpenDocument,
  onCloseDocument,
}: FeatureDetailPageViewProps) {
  if (loading) return <Spin />;
  if (error || !feature) {
    return <Alert type="error" showIcon message="Could not load this feature" description={error} />;
  }

  const doneTickets = feature.tickets.filter((ticket) => ticket.status === 'done').length;
  const openAssumptions = feature.assumptions.filter((assumption) => assumption.isOpen);
  const coveredCriteria = feature.acceptanceCriteria.filter((criterion) => criterion.coveredBy.length > 0);

  return (
    <>
      <PageHeader
        title={
          <Space size={10} wrap>
            <span style={{ fontFamily: MONO_FONT }}>{feature.slug}</span>
            <GateTag gate={feature.gate} managed={feature.managed} />
            {feature.profile !== 'none' ? <Tag>{feature.profile}</Tag> : null}
          </Space>
        }
        subtitle={
          <span>
            {feature.repositoryLabel} · <span style={{ fontFamily: MONO_FONT }}>{feature.directory}</span>
            {feature.createdAt ? ` · created ${formatDateTime(feature.createdAt)}` : ''}
          </span>
        }
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={onReload}>
              Reload
            </Button>
            <Button loading={toolRunning} onClick={() => onRunTool('validate')}>
              Validate graph
            </Button>
            <Tooltip title="Regenerates 05-ticket-graph.md, 06-traceability.md and registry.yaml from the tickets. Never hand-edit those three.">
              <Button loading={toolRunning} onClick={() => onRunTool('regenerate')}>
                Regenerate
              </Button>
            </Tooltip>
            <Tooltip title="Every `touches` path must exist in the repository or be marked `# new`">
              <Button loading={toolRunning} onClick={() => onRunTool('lintTouches')}>
                Lint touches
              </Button>
            </Tooltip>
          </Space>
        }
      />

      {feature.loadErrors.length > 0 ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${feature.loadErrors.length} problem(s) reading this plan`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {feature.loadErrors.map((loadError) => (
                <li key={loadError}>{loadError}</li>
              ))}
            </ul>
          }
        />
      ) : null}

      <Card size="small" style={{ marginBottom: 16 }}>
        <GateTimeline current={feature.gate} />
        <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <GateActions feature={feature} />
          <GateVerdictPanel verdict={feature.gateVerdict} feature={feature} />
        </div>
      </Card>

      <Space wrap size={10} style={{ marginBottom: 16 }}>
        <StatTile label="Units of work" value={feature.unitsOfWork.length} />
        <StatTile label="Tickets" value={`${doneTickets}/${feature.tickets.length}`} />
        <StatTile
          label="Critical path"
          value={formatHours(feature.graph.criticalPathHours)}
          hint="The floor on elapsed time. Adding people does not shorten a chain."
        />
        <StatTile label="Total effort" value={formatHours(feature.graph.totalEffortHours)} />
        <StatTile label="Left" value={formatHours(feature.graph.remainingHours)} />
        <StatTile
          label="Open assumptions"
          value={openAssumptions.length}
          tone={openAssumptions.some((assumption) => assumption.blocking) ? 'bad' : 'neutral'}
          hint={`${openAssumptions.filter((assumption) => assumption.blocking).length} of them blocking`}
        />
        <StatTile
          label="AC covered"
          value={`${coveredCriteria.length}/${feature.acceptanceCriteria.length}`}
          tone={coveredCriteria.length < feature.acceptanceCriteria.length ? 'bad' : 'good'}
        />
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          {
            key: 'units',
            label: `Units of work · ${feature.unitsOfWork.length}`,
            children: <UnitsOfWorkPanel feature={feature} />,
          },
          {
            key: 'graph',
            label: 'Graph',
            children: <GraphWaves graph={feature.graph} tickets={feature.tickets} />,
          },
          {
            key: 'verification',
            label: 'Verification',
            children: <VerificationPanel repositoryId={feature.repositoryId} slug={feature.slug} />,
          },
          { key: 'intent', label: 'Intent & design', children: <IntentPanel feature={feature} /> },
          {
            key: 'assumptions',
            label: `Assumptions · ${feature.assumptions.length}`,
            children: <AssumptionsPanel assumptions={feature.assumptions} />,
          },
          {
            key: 'traceability',
            label: `Traceability · ${feature.acceptanceCriteria.length}`,
            children: <TraceabilityPanel criteria={feature.acceptanceCriteria} />,
          },
          {
            key: 'audit',
            label: `Audit · ${feature.history.length}`,
            children: <AuditPanel history={feature.history} />,
          },
          {
            key: 'documents',
            label: 'Documents',
            children: (
              <Space wrap>
                {feature.documents.map((name) => (
                  <Button key={name} icon={<FileTextOutlined />} onClick={() => onOpenDocument(name)}>
                    {name}
                  </Button>
                ))}
              </Space>
            ),
          },
        ]}
      />

      <ControllerOutput
        outcome={outcome?.result ?? null}
        title={outcome?.title ?? ''}
        open={outcome !== null}
        onClose={onCloseOutcome}
      />

      <Modal
        open={openDocumentName !== null}
        title={
          <Space>
            <CodeOutlined />
            {openDocumentName}
          </Space>
        }
        width={900}
        footer={null}
        onCancel={onCloseDocument}
      >
        <pre
          style={{
            fontFamily: MONO_FONT,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            maxHeight: '65vh',
            overflow: 'auto',
            background: token.bgRaised,
            padding: 14,
            borderRadius: 8,
            margin: 0,
          }}
        >
          {document?.content ?? 'loading…'}
        </pre>
      </Modal>
    </>
  );
}
