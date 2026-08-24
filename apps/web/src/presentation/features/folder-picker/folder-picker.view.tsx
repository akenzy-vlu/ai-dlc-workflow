import {
  ArrowUpOutlined,
  CheckOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  LaptopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, List, Modal, Space, Spin, Tag, Tooltip, Typography } from 'antd';

import { MONO_FONT, token } from '@app/theme';
import type { DirectoryEntry } from '@domain/entities';
import type { FolderPickerViewProps } from './folder-picker.props';

export function FolderPickerView({
  open,
  title,
  confirmLabel,
  listing,
  loading,
  error,
  current,
  nativeAvailable,
  nativePending,
  onNavigate,
  onUp,
  onOpenNative,
  onConfirm,
  onCancel,
}: FolderPickerViewProps) {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      width={680}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {nativeAvailable ? (
            <Tooltip title="Opens Finder on the machine running the API">
              <Button icon={<LaptopOutlined />} loading={nativePending} onClick={onOpenNative}>
                Open Finder…
              </Button>
            </Tooltip>
          ) : (
            <Tooltip title="The API is not running on your desktop — in a container it has no window server, and its filesystem is not yours. Browse below instead.">
              <span style={{ fontSize: 12, color: token.textMuted }}>Finder unavailable</span>
            </Tooltip>
          )}
          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" icon={<CheckOutlined />} disabled={!current} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </Space>
        </Space>
      }
    >
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}

      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Button icon={<ArrowUpOutlined />} disabled={!listing?.parent} onClick={onUp}>
          Up
        </Button>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 11px',
            border: `1px solid ${token.border}`,
            borderRadius: 6,
            background: token.bgRaised,
            fontFamily: MONO_FONT,
            fontSize: 12,
            overflow: 'hidden',
          }}
        >
          <FolderOpenOutlined style={{ color: token.textSecondary }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current ?? '—'}
          </span>
        </div>
      </Space.Compact>

      <div style={{ maxHeight: 360, overflow: 'auto', border: `1px solid ${token.border}`, borderRadius: 6 }}>
        {loading && !listing ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : listing && listing.entries.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No sub-folders here"
            style={{ padding: 24 }}
          />
        ) : (
          <List<DirectoryEntry>
            size="small"
            dataSource={listing?.entries ?? []}
            renderItem={(entry) => (
              <List.Item
                style={{ cursor: 'pointer', paddingInline: 12 }}
                onClick={() => onNavigate(entry.absolutePath)}
                actions={[
                  entry.alreadyTracked ? (
                    <Tag key="tracked" color="success" style={{ marginInlineEnd: 0 }}>
                      tracked
                    </Tag>
                  ) : entry.hasPlans ? (
                    <Tooltip key="plans" title="Has an .ai/ directory — already planned with AI-DLC">
                      <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                        .ai
                      </Tag>
                    </Tooltip>
                  ) : entry.isRepository ? (
                    <Tag key="git" style={{ marginInlineEnd: 0 }}>
                      git
                    </Tag>
                  ) : null,
                ]}
              >
                <Space size={8}>
                  <FolderOutlined style={{ color: token.textSecondary }} />
                  <span>{entry.name}</span>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>

      <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Click a folder to open it, then <strong>{confirmLabel}</strong> to choose the one shown above.
      </Typography.Paragraph>
    </Modal>
  );
}
