import { useMemo, useState } from 'react';
import { App } from 'antd';

import { verificationRepository } from '@data/repositories';
import type { EvidenceBlob } from '@domain/entities';
import { formatDateTime } from '@shared/lib/format';
import type { EvidenceArchivePanelProps } from './evidence-archive-panel.props';
import { EvidenceArchivePanelView } from './evidence-archive-panel.view';

export function EvidenceArchivePanel({
  repositoryId,
  slug,
  lastRunFinishedAt,
  hasRun,
}: EvidenceArchivePanelProps) {
  const { message } = App.useApp();
  const ref = { repositoryId, slug };
  const archive = verificationRepository.useArchive(ref);
  const createArchive = verificationRepository.useCreateArchive();
  const [preview, setPreview] = useState<EvidenceBlob | null>(null);

  /**
   * A manifest captured before the last run finished describes evidence that has since
   * been overwritten — `evidence/` holds newer screenshots than the hashes claim. Worth
   * saying out loud, because the manifest is the part that gets committed and read by
   * someone who cannot see the directory.
   */
  const stale = useMemo(() => {
    const capturedAt = archive.data?.manifest?.capturedAt;
    if (!capturedAt || !lastRunFinishedAt) return false;
    return new Date(lastRunFinishedAt).getTime() > new Date(capturedAt).getTime();
  }, [archive.data?.manifest?.capturedAt, lastRunFinishedAt]);

  const totalBytes = useMemo(
    () => (archive.data?.blobs ?? []).reduce((total, blob) => total + blob.bytes, 0),
    [archive.data?.blobs],
  );

  return (
    <EvidenceArchivePanelView
      archive={archive.data}
      loading={archive.isLoading}
      archiving={createArchive.isPending}
      hasRun={hasRun}
      stale={stale}
      capturedAtLabel={formatDateTime(archive.data?.manifest?.capturedAt ?? null)}
      totalBytes={totalBytes}
      blobUrl={verificationRepository.blobUrl}
      preview={preview}
      onPreview={setPreview}
      onArchive={() => {
        void createArchive
          .run(ref)
          .then((manifest) =>
            message.success(
              `archived ${manifest.blobs.length} file(s) — evidence-manifest.json written next to the plan`,
            ),
          )
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
