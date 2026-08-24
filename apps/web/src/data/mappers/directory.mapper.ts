import type { DirectoryListing, PickerCapability } from '@domain/entities';
import type { DirectoryListingModel, PickerCapabilityModel } from '../models';

export function toDirectoryListing(model: DirectoryListingModel): DirectoryListing {
  return {
    path: model.path,
    parent: model.parent,
    roots: model.roots ?? [],
    entries: (model.entries ?? []).map((entry) => ({
      name: entry.name,
      absolutePath: entry.absolutePath,
      isRepository: entry.isRepository,
      hasPlans: entry.hasPlans,
      alreadyTracked: entry.alreadyTracked,
    })),
  };
}

export function toPickerCapability(model: PickerCapabilityModel): PickerCapability {
  return { nativePicker: model.nativePicker, roots: model.roots ?? [] };
}
