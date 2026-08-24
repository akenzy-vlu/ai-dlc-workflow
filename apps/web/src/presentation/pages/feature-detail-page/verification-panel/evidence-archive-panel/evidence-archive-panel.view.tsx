import {
  CloudUploadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Empty, Image, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MONO_FONT, token } from '@app/theme';
import type { EvidenceBlob } from '@domain/entities';
import type { EvidenceArchivePanelViewProps } from './evidence-archive-panel.props';

const formatBytes = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

const isImage = (contentType: string): boolean => contentType.startsWith('image/');

/**
 * The evidence archive: what this feature's approval actually rests on.
 *
 * Two files with opposite fates. `evidence/*.png` is gitignored, so the screenshots exist
 * only on the machine whose browser produced them. `evidence-manifest.json` is small,
 * textual and committed — it records which screenshots the evidence claims and the hash of
 * each one.
 *
 * That asymmetry is what makes `missing` the number worth reading. A manifest entry this
 * machine does not hold is evidence someone else produced: named, hashed, approved — and
 * not something you can look at. Reporting "5 of 5 present" in the same tone as "2 of 5"
 * would bury exactly the case a reviewer needs to notice.
 */
export function EvidenceArchivePanelView({
  archive,
  loading,
  archiving,
  hasRun,
  stale,
  capturedAtLabel,
  totalBytes,
  blobUrl,
  onArchive,
  preview,
  onPreview,
}: EvidenceArchivePanelViewProps) {
  const columns: ColumnsType<EvidenceBlob> = [
    {
      title: '',
      dataIndex: 'sha256',
      width: 76,
      render: (sha256: string, blob) => {
        if (!blob.held) {
          return (
            <Tooltip title="Not on this machine — the bytes never reached here">
              <span style={{ color: token.textMuted, fontSize: 18 }}>
                {isImage(blob.contentType) ? <FileImageOutlined /> : <FilePdfOutlined />}
              </span>
            </Tooltip>
          );
        }
        return isImage(blob.contentType) ? (
          <Image
            src={blobUrl(sha256)}
            alt={blob.path}
            width={60}
            height={38}
            style={{ objectFit: 'cover', borderRadius: 4, border: `1px solid ${token.border}` }}
            preview={{ src: blobUrl(sha256) }}
          />
        ) : (
          <Button type="text" icon={<FilePdfOutlined />} onClick={() => onPreview(blob)} />
        );
      },
    },
    {
      title: 'Path',
      dataIndex: 'path',
      ellipsis: true,
      render: (path: string) => <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>{path}</span>,
    },
    {
      title: 'Content hash',
      dataIndex: 'sha256',
      width: 150,
      render: (sha256: string) => (
        <Tooltip title={sha256}>
          {/* Named by its own hash: the same screenshot archived twice is one blob, and a
              blob can be cached forever because its name cannot outlive its content. */}
          <Typography.Text
            copyable={{ text: sha256 }}
            style={{ fontFamily: MONO_FONT, fontSize: 11, color: token.textSecondary }}
          >
            {sha256.slice(0, 12)}…
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: 'Size',
      dataIndex: 'bytes',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.bytes - b.bytes,
      render: (bytes: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: token.textSecondary }}>
          {formatBytes(bytes)}
        </span>
      ),
    },
    {
      title: 'Held here',
      dataIndex: 'held',
      width: 110,
      render: (held: boolean) =>
        held ? (
          <Tag color="success" style={{ marginInlineEnd: 0 }}>
            present
          </Tag>
        ) : (
          <Tag color="error" style={{ marginInlineEnd: 0 }}>
            missing
          </Tag>
        ),
    },
  ];

  const archiveButton = (
    <Tooltip
      title={
        hasRun
          ? 'Copies the screenshots into the content store and writes evidence-manifest.json next to the plan'
          : 'Nothing has been captured yet — run a verification first'
      }
    >
      <Button
        size="small"
        type={archive?.manifest ? 'default' : 'primary'}
        icon={<CloudUploadOutlined />}
        loading={archiving}
        disabled={!hasRun}
        onClick={onArchive}
      >
        {archive?.manifest ? 'Re-archive' : 'Archive evidence'}
      </Button>
    </Tooltip>
  );

  if (loading) return <Card size="small" loading title="Evidence archive" />;

  if (!archive?.manifest) {
    return (
      <Card size="small" title="Evidence archive" extra={archiveButton}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ maxWidth: 560, margin: '0 auto' }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Nothing archived yet</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                <code>evidence/</code> is gitignored, so these screenshots exist only on this
                machine. Archiving writes <code>evidence-manifest.json</code> next to the plan —
                small, textual, and meant to be committed — recording what the evidence claims and
                the hash of every file. A teammate who pulls the repository can then see what was
                approved, and verify the bytes when they reach them.
              </Typography.Text>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <Card
        size="small"
        title={
          <Space size={8}>
            <span>Evidence archive</span>
            <Tag style={{ marginInlineEnd: 0 }}>
              {archive.present}/{archive.present + archive.missing} present
            </Tag>
            {archive.missing > 0 ? (
              <Tag color="error" icon={<WarningOutlined />} style={{ marginInlineEnd: 0 }}>
                {archive.missing} missing
              </Tag>
            ) : null}
          </Space>
        }
        extra={archiveButton}
      >
        {archive.missing > 0 ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message={`${archive.missing} of ${archive.present + archive.missing} evidence files are not on this machine`}
            description={
              <span style={{ fontSize: 12 }}>
                The manifest names them and records their hashes, so they were produced and
                approved — somewhere else. This feature's G4 rests on screenshots you cannot look
                at. Getting the bytes here needs a shared store behind the console, or the machine
                that captured them to archive again.
              </span>
            }
          />
        ) : null}

        {stale ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="The manifest is older than the last run"
            description={
              <span style={{ fontSize: 12 }}>
                A verification has finished since this was archived, so the manifest describes
                evidence that has been replaced. Re-archive to make it describe what is actually in{' '}
                <code>evidence/</code> now.
              </span>
            }
          />
        ) : null}

        <Space size={16} wrap style={{ marginBottom: 10, fontSize: 12, color: token.textSecondary }}>
          <span>captured {capturedAtLabel}</span>
          <span>
            {archive.blobs.length} file(s) · {formatBytes(totalBytes)}
          </span>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11 }}>
            {archive.manifest.repositoryLabel}/{archive.manifest.slug}
          </span>
        </Space>

        <Table<EvidenceBlob>
          rowKey="sha256"
          size="small"
          pagination={false}
          dataSource={archive.blobs}
          columns={columns}
          scroll={{ x: 720 }}
          rowClassName={(blob) => (blob.held ? '' : 'kiln-row-muted')}
        />

        <Typography.Paragraph type="secondary" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
          The store lives under <code>~/.aidlc-console/evidence-cas/</code> and is disposable
          console state: delete it, archive again from any checkout that still has the files, and
          the result is byte-identical.
        </Typography.Paragraph>
      </Card>

      <Modal
        open={preview !== null}
        title={preview?.path}
        width={900}
        footer={null}
        onCancel={() => onPreview(null)}
      >
        {preview ? (
          <object
            data={blobUrl(preview.sha256)}
            type={preview.contentType}
            style={{ width: '100%', height: '70vh', border: `1px solid ${token.border}`, borderRadius: 8 }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              This browser will not display {preview.contentType} inline.{' '}
              <a href={blobUrl(preview.sha256)} target="_blank" rel="noreferrer">
                Open it in a new tab
              </a>
              .
            </Typography.Text>
          </object>
        ) : null}
      </Modal>
    </>
  );
}
