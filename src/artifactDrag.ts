// Dragging an artifact out of the Artifacts panel: onto the sidebar (to open it as a
// tab in a Space) or onto the chat (to add it to the chat). The panel, the sidebar
// and the chat are different parts of the window, so what is dragged is a small
// piece of data with its own type: the artifact's number. Pure, so it is easy to test.

// The type of the dragged data. (Only the browser's own drag carries it; a page
// cannot start a drag of this type that the app would trust, because the number is
// checked against the real artifacts before anything happens.)
export const ARTIFACT_DRAG = 'application/x-aib-artifact';

// What to put in the drag when a row starts being dragged.
export const artifactDragData = (id: number): string => String(id);

// Is this drag one of an artifact? (While dragging, a page can see only the types.)
export const hasArtifactDrag = (
  types: readonly string[] | null | undefined,
): boolean => (types ? Array.from(types).includes(ARTIFACT_DRAG) : false);

// Is this drag one of files from the computer (rather than something inside the
// app)? While dragging, a page can see only the types, and files show as "Files".
export const hasFileDrag = (
  types: readonly string[] | null | undefined,
): boolean => (types ? Array.from(types).includes('Files') : false);

// The artifact's number from dropped data, or null if it is not a plain number.
export function readArtifactDrag(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[0-9]{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 ? id : null;
}

// ---- Rows dragged out of the sidebar --------------------------------------------------
// A tab, a Space or an open artifact dragged from the sidebar onto the chat adds it
// to the chat as a link. The sidebar is a different page from the chat, so, as for
// artifacts from the panel, what is dragged is a small piece of data with its own
// type: what it is, and its number. The number is checked against the real tabs,
// Spaces and artifacts before anything is linked.

export const ITEM_DRAG = 'application/x-aib-item';

export type DraggedKind = 'tab' | 'space' | 'artifact';

// What to put in the drag when a sidebar row starts being dragged.
export const itemDragData = (kind: DraggedKind, id: number): string =>
  `${kind}:${id}`;

// Is this drag one of a sidebar row? (While dragging, a page sees only the types.)
export const hasItemDrag = (
  types: readonly string[] | null | undefined,
): boolean => (types ? Array.from(types).includes(ITEM_DRAG) : false);

// What was dragged, from dropped data, or null if it is not exactly "kind:number".
export function readItemDrag(
  raw: unknown,
): { kind: DraggedKind; id: number } | null {
  if (typeof raw !== 'string') return null;
  const match = /^(tab|space|artifact):([0-9]{1,9})$/.exec(raw);
  if (!match) return null;
  const id = Number(match[2]);
  return id >= 1 ? { kind: match[1] as DraggedKind, id } : null;
}
