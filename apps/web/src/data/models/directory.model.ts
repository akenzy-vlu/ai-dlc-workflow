export interface DirectoryEntryModel {
  name: string;
  absolutePath: string;
  isRepository: boolean;
  hasPlans: boolean;
  alreadyTracked: boolean;
}

export interface DirectoryListingModel {
  path: string;
  parent: string | null;
  roots: string[];
  entries: DirectoryEntryModel[];
}

export interface PickerCapabilityModel {
  nativePicker: boolean;
  roots: string[];
}
