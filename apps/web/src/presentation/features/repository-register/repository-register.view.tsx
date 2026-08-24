import { FolderOpenOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, List, Modal, Space, Tag, Typography } from 'antd';

import { token } from '@app/theme';
import { FolderPicker } from '@presentation/features/folder-picker';
import type { RepositoryRegisterViewProps } from './repository-register.props';

/**
 * Two ways in: paste a path, or point at a parent folder and let the scan find the
 * checkouts that already have `.ai/features/`. The second is how a portfolio of nine
 * repositories gets onto the board without nine trips through a file picker.
 */
export function RepositoryRegisterView({
  open,
  path,
  root,
  found,
  adding,
  scanning,
  onOpen,
  onClose,
  onPathChange,
  onRootChange,
  onAdd,
  onScan,
  browsing,
  onBrowse,
  onBrowseCancel,
  onBrowsePick,
}: RepositoryRegisterViewProps) {
  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={onOpen}>
        Add repository
      </Button>

      <Modal open={open} title="Add repositories" footer={null} onCancel={onClose} width={720}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Tracking a repository only reads it. Nothing is written to a checkout until you approve a
          gate or move a ticket, and even then the write goes through <code>aidlc.py</code>.
        </Typography.Paragraph>

        <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
          <Input
            prefix={<FolderOpenOutlined />}
            placeholder="/Users/you/work/some-repo"
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            onPressEnter={() => path.trim() && onAdd(path.trim())}
          />
          <Button icon={<FolderOpenOutlined />} onClick={() => onBrowse('path')}>
            Browse
          </Button>
          <Button type="primary" loading={adding} onClick={() => path.trim() && onAdd(path.trim())}>
            Add
          </Button>
        </Space.Compact>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Or scan a parent folder:
        </Typography.Text>
        <Space.Compact style={{ width: '100%', marginTop: 4 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="/Users/you/work"
            value={root}
            onChange={(event) => onRootChange(event.target.value)}
            onPressEnter={onScan}
          />
          <Button icon={<FolderOpenOutlined />} onClick={() => onBrowse('root')}>
            Browse
          </Button>
          <Button loading={scanning} onClick={onScan}>
            Scan
          </Button>
        </Space.Compact>

        {found.length > 0 ? (
          <List
            size="small"
            style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}
            dataSource={found}
            renderItem={(item) => (
              <List.Item
                actions={[
                  item.alreadyTracked ? (
                    <Tag key="tracked" color="success">
                      tracked
                    </Tag>
                  ) : (
                    <Button key="add" size="small" onClick={() => onAdd(item.absolutePath)}>
                      Add
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  title={<span style={{ fontSize: 13 }}>{item.suggestedLabel}</span>}
                  description={
                    <span style={{ fontSize: 11, color: token.textSecondary }}>
                      {item.absolutePath} · {item.featureCount} feature(s)
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        ) : null}
      </Modal>

      <FolderPicker
        open={browsing !== null}
        startAt={browsing === 'root' ? root : path}
        title={browsing === 'root' ? 'Choose a folder to scan' : 'Choose a repository'}
        confirmLabel={browsing === 'root' ? 'Scan this folder' : 'Use this repository'}
        onCancel={onBrowseCancel}
        onPick={onBrowsePick}
      />
    </>
  );
}
