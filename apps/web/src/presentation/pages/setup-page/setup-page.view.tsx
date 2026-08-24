import { CloudDownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Input, Modal, Space, Tag, Typography } from 'antd';

import { MONO_FONT, TERMINAL, token } from '@app/theme';
import { PageHeader } from '@presentation/components/page-header';
import { SetupStepRow } from './setup-step-row';
import type { SetupPageViewProps } from './setup-page.props';

/**
 * Sets up the browser runner on this machine.
 *
 * Two paths, cheap one first: most people who have run ai-dlc-verify before already have
 * a venv with Playwright in it, and pointing at it takes a second where installing takes
 * minutes and 150 MB. The installer is for the machine that genuinely has nothing.
 */
export function SetupPageView({
  runner,
  tooling,
  checking,
  installing,
  applyingInterpreter,
  stepStates,
  log,
  logRef,
  manualPath,
  confirmOpen,
  onManualPathChange,
  onUseInterpreter,
  onOpenConfirm,
  onCloseConfirm,
  onInstall,
  onRecheck,
}: SetupPageViewProps) {
  return (
    <>
      <PageHeader
        title="Setup"
        subtitle="What this machine needs in order to run the AI-DLC tooling. Everything here is a property of the laptop, not of any project."
        extra={
          <Button icon={<ReloadOutlined />} loading={checking} onClick={onRecheck}>
            Re-check
          </Button>
        }
      />

      <Space orientation="vertical" size={14} style={{ width: '100%' }}>
        <Card size="small" title="AI-DLC controller">
          {tooling?.available ? (
            <Descriptions
              size="small"
              column={3}
              colon={false}
              labelStyle={{ color: token.textSecondary, fontSize: 11.5 }}
            >
              <Descriptions.Item label="uow_graph">{tooling.uowGraphVersion}</Descriptions.Item>
              <Descriptions.Item label="Ruleset">{tooling.ruleset}</Descriptions.Item>
              <Descriptions.Item label="Python">{tooling.pythonBin}</Descriptions.Item>
              <Descriptions.Item label="Core" span={3}>
                <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>{tooling.corePath}</span>
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Alert
              type="error"
              showIcon
              message="The controller is not runnable"
              description={tooling?.error ?? 'checking…'}
            />
          )}
        </Card>

        <Card
          size="small"
          title={
            <Space size={8}>
              <span>Browser runner</span>
              {runner ? (
                <Tag color={runner.ready ? 'success' : 'warning'} style={{ marginInlineEnd: 0 }}>
                  {runner.ready ? 'ready' : 'not ready'}
                </Tag>
              ) : null}
            </Space>
          }
          extra={
            runner && !runner.ready ? (
              <Space size={6}>
                {runner.venvExists && !runner.interpreter.includes('.venvs') ? (
                  <Button
                    size="small"
                    loading={applyingInterpreter}
                    onClick={() => onUseInterpreter(`${runner.suggestedVenvPath}/bin/python`)}
                  >
                    Use existing venv
                  </Button>
                ) : null}
                <Button
                  size="small"
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  disabled={installing || !runner.requirementsPath}
                  onClick={onOpenConfirm}
                >
                  Install
                </Button>
              </Space>
            ) : null
          }
        >
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -4 }}>
            ai-dlc-verify keeps Playwright in a <em>separate process</em> on purpose — that is what lets
            a machine with none of this still resolve the ladder, read <code>run.json</code> and generate
            an evidence report. Only an actual browser walk needs what is below.
          </Typography.Paragraph>

          {runner ? (
            <>
              <Descriptions
                size="small"
                column={2}
                colon={false}
                labelStyle={{ color: token.textSecondary, fontSize: 11.5 }}
              >
                <Descriptions.Item label="Interpreter" span={2}>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>{runner.interpreter}</span>
                  <Tag style={{ marginInlineStart: 6, marginInlineEnd: 0, fontSize: 10.5 }}>
                    {runner.source}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Playwright">
                  {runner.playwrightInstalled ? runner.playwrightVersion : 'not installed'}
                </Descriptions.Item>
                <Descriptions.Item label="Chromium">
                  {runner.chromiumInstalled ? 'downloaded' : 'not downloaded'}
                </Descriptions.Item>
              </Descriptions>

              {runner.blockers.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 10 }}
                  message="Not ready yet"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                      {runner.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  }
                />
              ) : null}

              <div style={{ marginTop: 14 }}>
                {runner.steps.map((step) => (
                  <SetupStepRow key={step.id} step={step} state={stepStates[step.id]} ready={runner.ready} />
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                  Or point it at an interpreter you already have:
                </Typography.Text>
                <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                  <Input
                    placeholder={`${runner.suggestedVenvPath}/bin/python`}
                    value={manualPath}
                    onChange={(event) => onManualPathChange(event.target.value)}
                    onPressEnter={() => manualPath.trim() && onUseInterpreter(manualPath.trim())}
                    style={{ fontFamily: MONO_FONT, fontSize: 12 }}
                  />
                  <Button
                    loading={applyingInterpreter}
                    onClick={() => manualPath.trim() && onUseInterpreter(manualPath.trim())}
                  >
                    Use it
                  </Button>
                </Space.Compact>
              </div>
            </>
          ) : null}
        </Card>

        {log.length > 0 ? (
          <Card size="small" title="Install log" styles={{ body: { padding: 0 } }}>
            <div
              ref={logRef}
              style={{
                maxHeight: 340,
                overflowY: 'auto',
                background: TERMINAL.bg,
                padding: '12px 16px',
                fontFamily: MONO_FONT,
                fontSize: 11.5,
                lineHeight: 1.55,
              }}
            >
              {log.map((entry, index) => (
                <div
                  key={`${entry.at}-${index}`}
                  style={{
                    color:
                      entry.state === 'failed'
                        ? TERMINAL.stderr
                        : entry.line.startsWith('$')
                          ? TERMINAL.notice
                          : TERMINAL.text,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.line}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </Space>

      <Modal
        open={confirmOpen}
        title="Install the browser runner"
        okText="Install"
        confirmLoading={installing}
        onOk={onInstall}
        onCancel={onCloseConfirm}
      >
        <Typography.Paragraph style={{ fontSize: 12.5 }}>
          This creates a virtual environment at{' '}
          <code style={{ fontFamily: MONO_FONT }}>{runner?.suggestedVenvPath}</code>, installs
          Playwright into it, and downloads Chromium — around <strong>150 MB</strong>. It takes a few
          minutes on a normal connection.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Nothing is installed into your system Python and nothing is written to any repository. When
          it finishes, the console points <code>AIDLC_VERIFY_PYTHON</code> at the new venv and
          remembers it.
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
