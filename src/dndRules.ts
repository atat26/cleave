// The rules of drag and drop in the sidebar, as plain functions: what a pointer
// over an item or a Space's header means for the thing being dragged, and what
// request the app gets on a drop. No screen or Electron here, so it is easy to test.
export interface DragItem {
  kind: 'tab' | 'artifact' | 'space';
  id: number;
}

// Where the dragged thing would land.
export type DropAt =
  // Before a tab / artifact of a Space (beforeId null: at the end of its group).
  | { type: 'tab'; spaceId: number | null; beforeId: number | null }
  | { type: 'artifact'; spaceId: number | null; beforeId: number | null }
  // Into a Space as a whole (highlighted), or out of every Space (spaceId null).
  | { type: 'into'; spaceId: number | null }
  // Before a Space (null: at the end).
  | { type: 'space'; beforeId: number | null };

export const sameDrop = (a: DropAt | null, b: DropAt | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.type === b.type &&
    ('spaceId' in a && 'spaceId' in b ? a.spaceId === b.spaceId : true) &&
    ('beforeId' in a && 'beforeId' in b ? a.beforeId === b.beforeId : true));

// What a pointer over an item means for the thing being dragged. `upper` is true
// when the pointer is in the top half of the item. Pure, so it is easy to test.
export function dropForItem(
  drag: DragItem,
  item: DragItem,
  place: { spaceId: number | null; nextId: number | null },
  upper: boolean,
): DropAt | null {
  if (drag.kind === 'space') return null;
  if (drag.kind === 'tab') {
    return item.kind === 'tab'
      ? {
          type: 'tab',
          spaceId: place.spaceId,
          beforeId: upper ? item.id : place.nextId,
        }
      : { type: 'into', spaceId: place.spaceId };
  }
  return item.kind === 'artifact'
    ? {
        type: 'artifact',
        spaceId: place.spaceId,
        beforeId: upper ? item.id : place.nextId,
      }
    : { type: 'into', spaceId: place.spaceId };
}

// What a pointer over a Space's header means.
export function dropForSpaceHeader(
  drag: DragItem,
  spaceId: number,
  nextSpaceId: number | null,
  upper: boolean,
): DropAt | null {
  if (drag.kind !== 'space') return { type: 'into', spaceId };
  if (drag.id === spaceId) return null;
  return { type: 'space', beforeId: upper ? spaceId : nextSpaceId };
}

// Which request the app gets when the thing is dropped.
export function applyDrop(
  drag: DragItem,
  at: DropAt,
  api: {
    moveTab(tabId: number, spaceId: number | null, before: number | null): void;
    moveArtifactTab(
      id: number,
      spaceId: number | null,
      before: number | null,
    ): void;
    moveSpace(id: number, before: number | null): void;
  },
): boolean {
  if (drag.kind === 'tab') {
    if (at.type === 'tab') api.moveTab(drag.id, at.spaceId, at.beforeId);
    else if (at.type === 'into') api.moveTab(drag.id, at.spaceId, null);
    else return false;
    return true;
  }
  if (drag.kind === 'artifact') {
    if (at.type === 'artifact') {
      api.moveArtifactTab(drag.id, at.spaceId, at.beforeId);
    } else if (at.type === 'into') {
      api.moveArtifactTab(drag.id, at.spaceId, null);
    } else return false;
    return true;
  }
  if (at.type === 'space') {
    api.moveSpace(drag.id, at.beforeId);
    return true;
  }
  return false;
}
