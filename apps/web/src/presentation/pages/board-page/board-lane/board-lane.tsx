import { useMemo } from 'react';

import { sumHours } from '@domain/value-objects';
import { sortCards } from '../board-page.model';
import type { BoardColumnData, BoardLaneProps } from './board-lane.props';
import { BoardLaneView } from './board-lane.view';

export function BoardLane({
  lane,
  columns,
  orderBy,
  properties,
  showEmptyColumns,
  runFor,
  onLaunch,
  onOpenRun,
}: BoardLaneProps) {
  const columnData = useMemo<BoardColumnData[]>(
    () =>
      columns
        .map((column) => {
          const cards = sortCards(
            lane.rows.filter((card) => card.status === column.status),
            orderBy,
          );
          return {
            ...column,
            cards,
            // Sum the normalised hours, never the label: "1.5d" parses to 1.5 as a float
            // and would land in the column header as ninety minutes of work.
            hours: sumHours(cards, (card) => card.estimateHours),
          };
        })
        .filter((column) => showEmptyColumns || column.cards.length > 0),
    [lane.rows, columns, orderBy, showEmptyColumns],
  );

  return (
    <BoardLaneView
      label={lane.label}
      sublabel={lane.sublabel}
      totalCards={lane.rows.length}
      totalHours={sumHours(lane.rows, (card) => card.estimateHours)}
      columns={columnData}
      properties={properties}
      runFor={runFor}
      onLaunch={onLaunch}
      onOpenRun={onOpenRun}
    />
  );
}
