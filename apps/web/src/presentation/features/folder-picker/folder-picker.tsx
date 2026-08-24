import { useEffect, useState } from 'react';
import { App } from 'antd';

import { portfolioRepository } from '@data/repositories';
import type { FolderPickerProps } from './folder-picker.props';
import { FolderPickerView } from './folder-picker.view';

export function FolderPicker({
  open,
  startAt,
  title = 'Choose a folder',
  confirmLabel = 'Use this folder',
  onCancel,
  onPick,
}: FolderPickerProps) {
  const { message } = App.useApp();
  // undefined means "wherever the API starts"; the server owns that default because it
  // owns the roots, and hard-coding one here would break the moment they are configured.
  const [current, setCurrent] = useState<string | undefined>(startAt || undefined);

  const listing = portfolioRepository.useDirectories(open ? current : undefined);
  const capability = portfolioRepository.usePickerCapability();
  const native = portfolioRepository.usePickFolderNatively();

  // Reopening from a different field should land where that field points, not where the
  // last session happened to stop.
  useEffect(() => {
    if (open) setCurrent(startAt || undefined);
  }, [open, startAt]);

  return (
    <FolderPickerView
      open={open}
      title={title}
      confirmLabel={confirmLabel}
      listing={listing.data}
      loading={listing.isFetching}
      error={listing.error}
      current={listing.data?.path}
      nativeAvailable={capability.data?.nativePicker ?? false}
      nativePending={native.isPending}
      onNavigate={setCurrent}
      onUp={() => {
        const parent = listing.data?.parent;
        if (parent) setCurrent(parent);
      }}
      onOpenNative={() => {
        void native
          .run({ startAt: listing.data?.path })
          .then((result) => onPick(result.absolutePath))
          .catch((error: Error) => {
            // Cancelling the dialog is an outcome, not a failure worth shouting about.
            if (/no folder chosen/i.test(error.message)) return;
            message.error(error.message);
          });
      }}
      onConfirm={() => {
        if (listing.data?.path) onPick(listing.data.path);
      }}
      onCancel={onCancel}
    />
  );
}
