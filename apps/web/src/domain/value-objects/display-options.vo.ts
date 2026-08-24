/** How a view is grouped, ordered and how much of each row it shows. */
export interface DisplayOptions {
  /** What becomes a swimlane on a board, or a group heading in a list. */
  groupBy: string;
  orderBy: string;
  /** Which optional properties the rows carry. */
  properties: string[];
  showEmptyGroups: boolean;
  /** Board only: hide the `done` column, which is otherwise most of a finished board. */
  hideCompleted: boolean;
  /** Collapse one ticket seen in several checkouts of a project into one card. */
  mergeCheckouts: boolean;
}

export interface DisplayOption {
  value: string;
  label: string;
  /** Shown under the label when the choice is not self-explanatory. */
  hint?: string;
}

export interface DisplaySchema {
  groupBy: DisplayOption[];
  orderBy: DisplayOption[];
  properties: DisplayOption[];
}

/** One lane or group of rows, with the heading it was grouped under. */
export interface Grouped<T> {
  key: string;
  label: string;
  sublabel: string | null;
  rows: T[];
}

export function groupRows<T>(
  rows: readonly T[],
  groupBy: string,
  laneOf: (row: T, groupBy: string) => { key: string; label: string; sublabel: string | null },
): Grouped<T>[] {
  if (groupBy === 'none') return [{ key: 'all', label: '', sublabel: null, rows: [...rows] }];

  const lanes = new Map<string, Grouped<T>>();
  for (const row of rows) {
    const { key, label, sublabel } = laneOf(row, groupBy);
    const lane = lanes.get(key);
    if (lane) lane.rows.push(row);
    else lanes.set(key, { key, label, sublabel, rows: [row] });
  }

  return [...lanes.values()].sort(
    (a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label),
  );
}
