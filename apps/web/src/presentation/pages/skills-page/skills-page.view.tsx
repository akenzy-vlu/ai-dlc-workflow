import { CloudUploadOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MONO_FONT, token } from '@app/theme';
import type { Skill, SkillInstallation } from '@domain/entities';
import type { SkillInstallationState, SkillScope } from '@domain/enums';
import { EmptyHint } from '@presentation/components/empty-hint';
import { PageHeader } from '@presentation/components/page-header';
import type { SkillsPageViewProps } from './skills-page.props';

const SCOPE_COPY: Record<SkillScope, { color: string; hint: string }> = {
  global: {
    color: 'geekblue',
    hint: 'Installs once into ~/.claude/skills and loads in every project on this machine.',
  },
  project: {
    color: 'purple',
    hint: 'Installs into a repository’s .claude/skills and loads only there — and reaches teammates through git rather than a manual copy per machine.',
  },
};

const STATE_COPY: Record<SkillInstallationState, { color: string; label: string; hint: string }> = {
  'not-installed': {
    color: 'default',
    label: 'not installed',
    hint: 'Nothing at this target yet.',
  },
  'up-to-date': {
    color: 'success',
    label: 'up to date',
    hint: 'Byte-identical to this checkout.',
  },
  outdated: {
    color: 'warning',
    label: 'differs',
    hint: 'The installed copy is not what this checkout holds — either the source moved on, or the target was edited by hand. Installing overwrites it.',
  },
};

export function SkillsPageView({
  skills,
  loading,
  installing,
  onRefresh,
  onSync,
  onInstall,
  onOpenFiles,
}: SkillsPageViewProps) {
  const columns: ColumnsType<Skill> = [
    {
      title: 'Skill',
      dataIndex: 'id',
      render: (id: string, row) => (
        <div>
          <Space size={6}>
            <strong>{id}</strong>
            <Tooltip title={SCOPE_COPY[row.scope].hint}>
              <Tag color={SCOPE_COPY[row.scope].color} style={{ marginInlineEnd: 0 }}>
                {row.scope}
              </Tag>
            </Tooltip>
            {row.nameMismatch ? (
              <Tooltip
                title={`The directory is "${id}" but the frontmatter declares "${row.declaredName}". Claude Code loads it under the directory name, so the frontmatter is the half that is wrong.`}
              >
                <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                  name mismatch
                </Tag>
              </Tooltip>
            ) : null}
          </Space>
          <div style={{ fontSize: 11, color: token.textSecondary, fontFamily: MONO_FONT }}>
            {row.sourcePath}
          </div>
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 12, marginBottom: 0, marginTop: 4, maxWidth: 640 }}
            ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
          >
            {row.description}
          </Typography.Paragraph>
        </div>
      ),
    },
    {
      title: 'Files',
      dataIndex: 'fileCount',
      width: 70,
      align: 'right',
      render: (count: number) => <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{count}</span>,
    },
    {
      title: 'Installed',
      key: 'installations',
      width: 460,
      render: (_, row) => <Targets skill={row} installing={installing} onSync={onSync} onInstall={onInstall} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Skills"
        subtitle="The skill packages this checkout ships, and where each one is installed"
        extra={
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
            Re-read
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Scope is declared by the package, not chosen here"
        description={
          <span>
            A skill&rsquo;s <code>scope:</code> lives in its own <code>SKILL.md</code>, which is why a{' '}
            <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
              global
            </Tag>{' '}
            skill offers one machine-wide sync and a{' '}
            <Tag color="purple" style={{ marginInlineEnd: 0 }}>
              project
            </Tag>{' '}
            skill offers one install per tracked repository. Installing replaces the target
            outright rather than merging into it, so a file dropped upstream does not survive
            there.
          </span>
        }
      />

      <Table<Skill>
        rowKey="id"
        columns={columns}
        dataSource={skills}
        loading={loading}
        pagination={false}
        size="middle"
        onRow={(skill) => ({
          onClick: () => onOpenFiles(skill.id),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <EmptyHint
              title="No skill packages found"
              hint="The API scans AIDLC_SKILL_SOURCES — by default this repo's skills/ and examples/. A package is any directory holding a SKILL.md."
            />
          ),
        }}
      />
    </>
  );
}

function Targets({
  skill,
  installing,
  onSync,
  onInstall,
}: {
  skill: Skill;
  installing: string | null;
  onSync: (skillId: string) => void;
  onInstall: (skillId: string, repositoryId: string) => void;
}) {
  if (skill.installations.length === 0) {
    // Only reachable for a project skill with nothing tracked. Saying so beats rendering
    // a disabled button whose reason is invisible.
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        No tracked repositories yet — add one under Repositories, then install it there.
      </Typography.Text>
    );
  }

  return (
    <Space orientation="vertical" size={6} style={{ width: '100%' }}>
      {skill.installations.map((installation) => (
        <TargetRow
          key={installation.targetId}
          skill={skill}
          installation={installation}
          busy={installing === skill.id}
          onSync={onSync}
          onInstall={onInstall}
        />
      ))}
    </Space>
  );
}

function TargetRow({
  skill,
  installation,
  busy,
  onSync,
  onInstall,
}: {
  skill: Skill;
  installation: SkillInstallation;
  busy: boolean;
  onSync: (skillId: string) => void;
  onInstall: (skillId: string, repositoryId: string) => void;
}) {
  const state = STATE_COPY[installation.state];
  const isGlobal = skill.scope === 'global';
  const current = installation.state === 'up-to-date';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
      <Tooltip title={installation.targetPath}>
        <span
          style={{
            fontSize: 12,
            color: token.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 200,
          }}
        >
          {installation.targetLabel}
        </span>
      </Tooltip>

      <Space size={6}>
        <Tooltip title={state.hint}>
          <Tag color={state.color} style={{ marginInlineEnd: 0, fontSize: 11 }}>
            {state.label}
          </Tag>
        </Tooltip>

        <Button
          size="small"
          type={current ? 'default' : 'primary'}
          loading={busy}
          icon={isGlobal ? <CloudUploadOutlined /> : <DownloadOutlined />}
          onClick={(e) => {
            // The row itself opens the file drawer on click (AC-09); this button must keep
            // working independently rather than also opening the drawer underneath it.
            e.stopPropagation();
            isGlobal ? onSync(skill.id) : onInstall(skill.id, installation.targetId);
          }}
        >
          {/* Re-installing an identical package is allowed but pointless, so the label
              stops advertising it as an update once the target already matches. */}
          {current ? 'Reinstall' : isGlobal ? 'Sync' : 'Install'}
        </Button>
      </Space>
    </div>
  );
}
