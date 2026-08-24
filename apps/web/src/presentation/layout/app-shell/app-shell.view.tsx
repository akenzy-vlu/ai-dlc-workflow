import { Badge, Button, Layout, Menu, Tooltip } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { Outlet } from 'react-router-dom';

import { accent, ink, semantic, token } from '@app/theme';
import { KilnLockup } from '@presentation/components/kiln-mark';
import { ActorButton } from '@presentation/features/identity';
import { NewFeatureModal } from '@presentation/features/new-feature';
import { ThemeSwitch } from '@presentation/features/theme-switch';
import { AgentsWorkingPill } from './agents-working-pill';
import { CommandPalette } from './command-palette';
import type { AppShellViewProps, NavBadge } from './app-shell.props';

const BADGE_COLOR: Record<NavBadge, string> = {
  // Blockers are amber: the inbox is the one place a person must look. A running agent is
  // activity, not attention, so it stays neutral.
  blockers: accent.fill,
  agents: ink[400],
  setup: semantic.warning,
};

export function AppShellView({
  nav,
  selectedKey,
  counts,
  modifierKey,
  activeRuns,
  sweep,
  onNavigate,
  onOpenPalette,
  onOpenNewFeature,
  paletteOpen,
  newFeatureOpen,
  onClosePalette,
  onCloseNewFeature,
}: AppShellViewProps) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="dark" width={224} breakpoint="lg" collapsedWidth={0} className="kiln-sider">
        <div style={{ padding: '16px 16px 12px' }}>
          <KilnLockup size={19} />
          <div
            style={{
              color: ink[500],
              fontSize: 10.5,
              letterSpacing: 0.5,
              marginTop: 4,
              paddingLeft: 28,
            }}
          >
            AI-DLC CONSOLE
          </div>
        </div>

        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" onClick={onOpenPalette} style={railButton}>
            <SearchOutlined />
            <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
            <kbd className="kiln-kbd">{modifierKey}</kbd>
            <kbd className="kiln-kbd">K</kbd>
          </button>

          <button type="button" onClick={onOpenNewFeature} style={{ ...railButton, border: '1px solid transparent', background: 'transparent' }}>
            <PlusOutlined />
            <span style={{ flex: 1, textAlign: 'left' }}>New feature</span>
            <kbd className="kiln-kbd">c</kbd>
          </button>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => onNavigate(key)}
          style={{ background: 'transparent', borderInlineEnd: 'none' }}
          items={nav.map((group) => ({
            type: 'group' as const,
            label: <span style={groupLabel}>{group.label}</span>,
            children: group.items.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && counts[item.badge] > 0 ? (
                    <Badge
                      count={item.badge === 'setup' ? 0 : counts[item.badge]}
                      dot={item.badge === 'setup'}
                      size="small"
                      color={BADGE_COLOR[item.badge]}
                    />
                  ) : null}
                </span>
              ),
            })),
          }))}
        />
      </Layout.Sider>

      <Layout>
        <Layout.Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '0 20px',
            borderBottom: `1px solid ${token.border}`,
          }}
        >
          {sweep ? (
            <Tooltip title="Running `aidlc check` for every managed feature's next gate">
              <span style={{ fontSize: 12, color: token.textSecondary }}>
                checking gates {sweep.done}/{sweep.total}
              </span>
            </Tooltip>
          ) : null}
          <AgentsWorkingPill runs={activeRuns} />
          <Button size="small" icon={<SearchOutlined />} onClick={onOpenPalette}>
            Search
          </Button>
          <ThemeSwitch />
          <ActorButton />
        </Layout.Header>

        <Layout.Content style={{ padding: '20px 24px 40px', maxWidth: 1720, width: '100%', margin: '0 auto' }}>
          <Outlet />
        </Layout.Content>
      </Layout>

      <CommandPalette open={paletteOpen} onClose={onClosePalette} />
      <NewFeatureModal open={newFeatureOpen} onClose={onCloseNewFeature} />
    </Layout>
  );
}

const railButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 8px',
  borderRadius: 8,
  border: `1px solid ${ink[800]}`,
  background: 'rgba(237, 234, 227, 0.05)',
  color: ink[300],
  fontSize: 12.5,
  cursor: 'pointer',
};

const groupLabel: React.CSSProperties = {
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: 0.7,
  color: 'var(--gp-500)',
  fontWeight: 500,
};
