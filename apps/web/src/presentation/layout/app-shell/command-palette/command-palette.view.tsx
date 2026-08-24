import {
  ApartmentOutlined,
  CheckSquareOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Empty, Input, Modal, Spin, Tag } from 'antd';

import { MONO_FONT, STATUS_COLORS, token } from '@app/theme';
import { SEARCH_KIND_LABELS, type SearchKind } from '@domain/enums';
import type { CommandPaletteViewProps } from './command-palette.props';

const KIND_ICON: Record<SearchKind, React.ReactNode> = {
  repository: <DatabaseOutlined />,
  feature: <ApartmentOutlined />,
  'unit-of-work': <TagsOutlined />,
  ticket: <CheckSquareOutlined />,
  criterion: <FileTextOutlined />,
  assumption: <QuestionCircleOutlined />,
};

/**
 * One search box over everything.
 *
 * Keyboard-first because the query is almost always an id recalled mid-thought —
 * `T-05-02`, `AC-11` — and reaching for a mouse breaks the thought. Results keep their
 * kind and repository visible: `T-05-01` exists in four repositories at once in a real
 * portfolio, so a hit that does not say which one it belongs to is worse than no hit.
 */
export function CommandPaletteView({
  open,
  term,
  hits,
  cursor,
  searching,
  belowMinimum,
  onTermChange,
  onKeyDown,
  onHover,
  onSelect,
  onClose,
}: CommandPaletteViewProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={640}
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
      style={{ top: 96 }}
      destroyOnHidden
    >
      <Input
        autoFocus
        size="large"
        variant="borderless"
        prefix={<SearchOutlined style={{ color: token.textMuted }} />}
        placeholder="Search features, slices, tickets, criteria, assumptions…"
        value={term}
        onChange={(event) => onTermChange(event.target.value)}
        onKeyDown={onKeyDown}
        style={{ borderBottom: `1px solid ${token.border}`, padding: '12px 16px' }}
      />

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {searching && hits.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : belowMinimum ? (
          <div style={{ padding: '18px 20px', fontSize: 12, color: token.textSecondary }}>
            Type at least two characters. An exact id wins over prose, so <code>T-05-01</code> lands on
            the ticket rather than on everything mentioning it.
          </div>
        ) : hits.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Nothing matches “${term}”`} />
          </div>
        ) : (
          hits.map((hit, index) => (
            <button
              key={`${hit.kind}-${hit.path}-${hit.badge}-${index}`}
              type="button"
              onClick={() => onSelect(hit)}
              onMouseEnter={() => onHover(index)}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                width: '100%',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '9px 16px',
                background: index === cursor ? token.bgRaised : 'transparent',
                borderLeft: `2px solid ${index === cursor ? 'var(--accent-fill)' : 'transparent'}`,
              }}
            >
              <span style={{ color: token.textMuted, fontSize: 14, width: 16 }}>{KIND_ICON[hit.kind]}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {hit.badge ? (
                    <span style={{ fontFamily: MONO_FONT, fontSize: 11.5, fontWeight: 500, color: token.textPrimary }}>
                      {hit.badge}
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: 13,
                      color: token.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hit.title}
                  </span>
                </span>
                <span style={{ display: 'block', fontSize: 11, color: token.textSecondary }}>
                  {hit.subtitle}
                </span>
              </span>
              {hit.status ? (
                <Tag
                  style={{
                    marginInlineEnd: 0,
                    fontSize: 10.5,
                    color: STATUS_COLORS[hit.status] ?? token.textSecondary,
                    borderColor: 'transparent',
                  }}
                >
                  {hit.status}
                </Tag>
              ) : null}
              <span style={{ fontSize: 10.5, color: token.textMuted, width: 68, textAlign: 'right' }}>
                {SEARCH_KIND_LABELS[hit.kind]}
              </span>
            </button>
          ))
        )}
      </div>

      <div
        style={{
          borderTop: `1px solid ${token.border}`,
          padding: '7px 16px',
          fontSize: 11,
          color: token.textMuted,
          display: 'flex',
          gap: 14,
        }}
      >
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </Modal>
  );
}
