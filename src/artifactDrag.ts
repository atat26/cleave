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

// The artifact's number from dropped data, or null if it is not a plain number.
export function readArtifactDrag(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[0-9]{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 ? id : null;
}
