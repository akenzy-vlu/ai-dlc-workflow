export interface DirectoryEntry {
  name: string;
  absolutePath: string;
  /** Has a `.git` — plausibly something to track. */
  isRepository: boolean;
  /** Has an `.ai/` directory — already planned with AI-DLC. */
  hasPlans: boolean;
  alreadyTracked: boolean;
}

export interface DirectoryListing {
  path: string;
  /** Null at a browse root, which is what stops the UI offering a way above it. */
  parent: string | null;
  roots: string[];
  entries: DirectoryEntry[];
}

export interface PickerCapability {
  /**
   * Whether the API can open the operating system's own folder dialog.
   *
   * False whenever the API is not sharing a desktop with the person looking at the
   * console — most obviously in a container, where the filesystem is not even theirs.
   */
  nativePicker: boolean;
  roots: string[];
}
