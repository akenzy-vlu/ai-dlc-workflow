import { CameraOutlined, CheckCircleFilled, CloseCircleFilled, PlayCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Descriptions, Empty, Image, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { MONO_FONT, semantic, token } from '@app/theme';
import type { EvidenceResult, VerificationEnvironment } from '@domain/entities';
import { RUNG_EXPLANATIONS, RUNG_LABELS, type VerificationRung } from '@domain/enums';
import { ControllerOutput } from '@presentation/components/controller-output';
import { formatDateTime } from '@shared/lib/format';
import { EvidenceArchivePanel } from './evidence-archive-panel';
import type { VerificationPanelViewProps } from './verification-panel.props';

const RUNG_TONE: Record<VerificationRung, string> = {
  'not applicable': 'default',
  skipped: 'warning',
  capable: 'success',
  'config error': 'error',
};

/**
 * The G4 half that runs a browser.
 *
 * The rung is the headline, not the run, because the rung decides whether any of this can
 * gate anything. `--write` is offered only on `capable`: writing the evidence block
 * anywhere else produces checkboxes the project can never tick, and `check_g4` counts
 * unticked boxes.
 */
export function VerificationPanelView({
  verification,
  repositoryId,
  slug,
  loading,
  running,
  checking,
  confirmWriteOpen,
  acceptWrites,
  outcome,
  artifactUrl,
  results,
  onRun,
  onOpenConfirmWrite,
  onCloseConfirmWrite,
  onAcceptWritesChange,
  onCheckEvidence,
  onCloseOutcome,
}: VerificationPanelViewProps) {
  if (loading || !verification) return <Card size="small" loading />;

  if (!verification.installed) {
    return (
      <Alert
        type="info"
        showIcon
        message="ai-dlc-verify is not installed on this machine"
        description={
          <span style={{ fontSize: 12 }}>
            Install it next to ai-dlc-core (<code>~/.claude/skills/ai-dlc-verify</code>) or point{' '}
            <code>AIDLC_VERIFY_PATH</code> at it. Everything else on this page works without it — a
            project with no verification blocks no gate.
          </span>
        }
      />
    );
  }

  const columns: ColumnsType<EvidenceResult> = [
    { title: 'Step', dataIndex: 'step', width: 90, render: (id: string) => <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{id}</span> },
    { title: 'Environment', dataIndex: 'environment', width: 170 },
    { title: 'Viewport', dataIndex: 'viewport', width: 110 },
    {
      title: 'Verdict',
      dataIndex: 'verdict',
      width: 100,
      render: (verdict: string) =>
        verdict === 'pass' ? (
          <Tag color="success" style={{ marginInlineEnd: 0 }}>pass</Tag>
        ) : (
          <Tag color="error" style={{ marginInlineEnd: 0 }}>{verdict}</Tag>
        ),
    },
    {
      title: 'Took',
      dataIndex: 'durationMs',
      width: 80,
      align: 'right',
      render: (ms: number) => <span style={{ fontSize: 12, color: token.textSecondary }}>{(ms / 1000).toFixed(1)}s</span>,
    },
    { title: 'URL', dataIndex: 'url', ellipsis: true, render: (url: string) => <span style={{ fontFamily: MONO_FONT, fontSize: 11 }}>{url}</span> },
    {
      title: 'Screenshot',
      dataIndex: 'screenshot',
      width: 110,
      render: (screenshot: string | null) =>
        screenshot ? (
          <Image
            src={artifactUrl(screenshot)}
            alt={screenshot}
            width={64}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 4, border: `1px solid ${token.border}` }}
          />
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
  ];

  const envColumns: ColumnsType<VerificationEnvironment> = [
    { title: 'Name', dataIndex: 'name', render: (name: string) => <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{name}</span> },
    { title: 'URL', dataIndex: 'url', ellipsis: true, render: (url: string) => <span style={{ fontFamily: MONO_FONT, fontSize: 11 }}>{url}</span> },
    { title: 'Login', dataIndex: 'recipe', width: 130, render: (recipe: string) => <Tag style={{ marginInlineEnd: 0 }}>{recipe}</Tag> },
    {
      title: 'Required',
      dataIndex: 'required',
      width: 90,
      render: (required: boolean) =>
        required ? (
          <Tag style={{ marginInlineEnd: 0, background: token.bgRaised, borderColor: token.border, color: token.textSecondary }}>required</Tag>
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
    {
      title: 'Writes',
      dataIndex: 'writes',
      width: 90,
      render: (writes: boolean) =>
        writes ? (
          <Tooltip title="Walking this environment mutates real data">
            <Tag color="warning" style={{ marginInlineEnd: 0 }}>writes</Tag>
          </Tooltip>
        ) : (
          <span style={{ color: token.textMuted }}>—</span>
        ),
    },
    {
      title: 'Ready',
      dataIndex: 'ready',
      width: 200,
      render: (ready: boolean, env) =>
        ready ? (
          <Tag color="success" style={{ marginInlineEnd: 0 }}>ready</Tag>
        ) : (
          <Tooltip title={`Missing: ${env.missing.join(', ')}`}>
            <Tag style={{ marginInlineEnd: 0 }}>missing {env.missing.length} credential(s)</Tag>
          </Tooltip>
        ),
    },
  ];

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Card size="small">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <Space size={8} style={{ marginBottom: 4 }}>
              <Tag color={RUNG_TONE[verification.rung]} style={{ marginInlineEnd: 0 }}>
                {RUNG_LABELS[verification.rung]}
              </Tag>
              {verification.reason ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {verification.reason}
                </Typography.Text>
              ) : null}
            </Space>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
              {RUNG_EXPLANATIONS[verification.rung]}
            </Typography.Paragraph>
          </div>

          <Space wrap>
            <Button
              icon={<PlayCircleOutlined />}
              disabled={!verification.canRun || !verification.runner.ready}
              loading={running && !confirmWriteOpen}
              onClick={() => onRun(false)}
            >
              Run
            </Button>
            <Tooltip
              title={
                !verification.canRun
                  ? 'Only the `capable` rung may write evidence'
                  : !verification.runner.ready
                    ? 'The browser runner is not installed on this machine'
                    : 'Also writes 08-evidence.md and the checkbox block G4 counts'
              }
            >
              <Button
                type="primary"
                icon={<CameraOutlined />}
                disabled={!verification.canRun || !verification.runner.ready}
                onClick={onOpenConfirmWrite}
              >
                Run and write evidence
              </Button>
            </Tooltip>
            <Button loading={checking} onClick={onCheckEvidence}>
              Validate ticked boxes
            </Button>
          </Space>
        </div>

        {verification.canRun && !verification.runner.ready ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="This project is ready; this machine is not"
            description={
              <span style={{ fontSize: 12 }}>
                {verification.runner.blockers.join('; ')}.{' '}
                <Link to={ROUTES.setup}>Set up the browser runner</Link> — a one-time install, and
                nothing about the project needs to change.
              </span>
            }
          />
        ) : null}

        {verification.errors.length > 0 ? (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="Configuration contradiction"
            description={
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {verification.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            }
          />
        ) : verification.blockedRequired.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={`Required environment(s) this machine cannot reach: ${verification.blockedRequired.join(', ')}`}
            description={
              <span style={{ fontSize: 12 }}>
                Add the missing keys to <code>.ai/credentials.env</code> in the repository. That file
                is not matched by a <code>.env*</code> gitignore pattern — check with{' '}
                <code>git check-ignore -v</code>.
              </span>
            }
          />
        ) : verification.unreadyButNotGating.length > 0 ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            {verification.unreadyButNotGating.join(', ')}{' '}
            {verification.unreadyButNotGating.length === 1 ? 'has' : 'have'} no credentials on this
            machine, but this feature's spec does not walk{' '}
            {verification.unreadyButNotGating.length === 1 ? 'it' : 'them'}, so nothing is blocked.
          </Typography.Paragraph>
        ) : null}
      </Card>

      <Card size="small" title="Environments">
        <Table<VerificationEnvironment>
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={verification.environments}
          columns={envColumns}
        />
      </Card>

      {verification.run ? (
        <Card
          size="small"
          title={
            <Space size={8}>
              {verification.run.passed ? (
                <CheckCircleFilled style={{ color: semantic.success }} />
              ) : (
                <CloseCircleFilled style={{ color: semantic.danger }} />
              )}
              <span>Last run</span>
              <Tag style={{ marginInlineEnd: 0 }}>
                {verification.run.counts.pass}/{verification.run.counts.total} passed
              </Tag>
            </Space>
          }
        >
          <Descriptions
            size="small"
            column={3}
            colon={false}
            labelStyle={{ color: token.textSecondary, fontSize: 11.5 }}
            style={{ marginBottom: 10 }}
          >
            <Descriptions.Item label="Finished">{formatDateTime(verification.run.finishedAt)}</Descriptions.Item>
            <Descriptions.Item label="Browser">{verification.run.browser || '—'}</Descriptions.Item>
            <Descriptions.Item label="Against">
              <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>
                {verification.run.branch}@{verification.run.commit || '?'}
              </span>
              {verification.run.dirty ? (
                <Tooltip title="The working tree had uncommitted changes — this evidence proves less than it looks like it does">
                  <Tag color="warning" style={{ marginInlineStart: 6, marginInlineEnd: 0 }}>dirty</Tag>
                </Tooltip>
              ) : null}
            </Descriptions.Item>
          </Descriptions>

          <Table<EvidenceResult>
            rowKey={(row) => `${row.environment}/${row.viewport}/${row.step}`}
            size="small"
            pagination={false}
            dataSource={results}
            columns={columns}
            scroll={{ x: 900 }}
            expandable={{
              rowExpandable: (row) => row.messages.length > 0,
              expandedRowRender: (row) => (
                <pre style={{ margin: 0, fontSize: 11.5, fontFamily: MONO_FONT, whiteSpace: 'pre-wrap' }}>
                  {row.messages.join('\n')}
                </pre>
              ),
            }}
          />
        </Card>
      ) : (
        <Card size="small">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              verification.canRun
                ? 'No run yet — evidence appears here once one finishes'
                : 'No evidence on this machine'
            }
          />
        </Card>
      )}

      <EvidenceArchivePanel
        repositoryId={repositoryId}
        slug={slug}
        lastRunFinishedAt={verification.run?.finishedAt ?? null}
        hasRun={verification.run !== null}
      />

      <Modal
        open={confirmWriteOpen}
        title="Run and write evidence"
        okText="Run it"
        okButtonProps={{ disabled: verification.writingEnvironments.length > 0 && !acceptWrites }}
        confirmLoading={running}
        onOk={() => onRun(true)}
        onCancel={onCloseConfirmWrite}
      >
        <Typography.Paragraph style={{ fontSize: 12.5 }}>
          This opens a real browser, walks {verification.stepIds.length} step(s) across{' '}
          {verification.environments.filter((env) => env.ready).length} environment(s) and{' '}
          {verification.viewports.length} viewport(s), and appends a checkbox block to{' '}
          <code>uow.md</code> that G4 will count.
        </Typography.Paragraph>
        {verification.writingEnvironments.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`${verification.writingEnvironments.join(', ')} mutate real data`}
            description={
              <Checkbox checked={acceptWrites} onChange={(event) => onAcceptWritesChange(event.target.checked)}>
                I know this run will create or change records in those environments
              </Checkbox>
            }
          />
        ) : null}
      </Modal>

      <ControllerOutput
        outcome={outcome?.result ?? null}
        title={outcome?.title ?? ''}
        open={outcome !== null}
        onClose={onCloseOutcome}
      />
    </Space>
  );
}
