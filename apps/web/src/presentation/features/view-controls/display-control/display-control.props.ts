import type { DisplayOptions, DisplaySchema } from '@domain/value-objects';

export interface DisplayControlProps {
  schema: DisplaySchema;
  display: DisplayOptions;
  onChange: (patch: Partial<DisplayOptions>) => void;
  onReset: () => void;
  isCustomised: boolean;
  /** Board-only switches: hide completed, merge checkouts. */
  showBoardOptions?: boolean;
}

export type DisplayControlViewProps = DisplayControlProps;
