// Drag and drop in the sidebar: tabs between Spaces and into a new order, open
// artifacts the same, and Spaces into a new order (by the grip on their row). It
// also does Alt+Up / Alt+Down, the keyboard way to move the focused item.
//
// How it works: one provider holds what is being dragged and where it would land
// right now. Every row and Space header asks the provider for props that make it a
// drag source and a drop target, and shows its own mark (a line before it, or a
// dashed outline). Dropping asks the app to move the thing (the rules are in
// model.ts). The page itself is never touched while dragging.
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import {
  hasArtifactDrag,
  readArtifactDrag,
  ARTIFACT_DRAG,
} from './artifactDrag.ts';
import {
  applyDrop,
  dropForItem,
  dropForSpaceHeader,
  sameDrop,
} from './dndRules.ts';
import type { DragItem, DropAt } from './dndRules.ts';

interface Dnd {
  drag: DragItem | null;
  over: DropAt | null;
  // Props that make a row a drag source and a drop target.
  itemProps(
    item: DragItem,
    place: { spaceId: number | null; nextId: number | null },
    options?: { halves?: boolean },
  ): RowDnd;
  // Props for a Space's header row (a drop target; `grip` makes it draggable).
  spaceProps(
    spaceId: number,
    nextSpaceId: number | null,
  ): RowDnd & { grip: GripProps };
  // A small drop zone at the end of a group (shown only while dragging).
  endSlot(at: DropAt): ReactNode;
  // For the empty background of the list: dropping a tab or artifact there takes
  // it out of every Space (the line shows it landing at the end of the loose ones).
  backgroundProps(): {
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

export interface RowDnd {
  className: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  'data-dnd-key'?: string;
}

export interface GripProps {
  draggable: true;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}

const DndContext = createContext<Dnd | null>(null);

export const useDnd = (): Dnd => {
  const value = useContext(DndContext);
  if (!value) throw new Error('DndProvider is missing');
  return value;
};

const keyOf = (item: DragItem) => `${item.kind}:${item.id}`;

// An artifact dragged in from the Artifacts panel (a different part of the window).
// While it is over the sidebar only its type can be seen, not which artifact it is,
// so it stands in as an artifact with no number until it is dropped.
const FOREIGN_ARTIFACT: DragItem = { kind: 'artifact', id: 0 };

// A tilted copy of the row for the pointer to carry.
function startGhost(event: DragEvent, from: HTMLElement) {
  const rect = from.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: 'fixed',
    top: '-1000px',
    left: '0',
    width: `${rect.width}px`,
    background: 'var(--c-surface)',
    border: '1px solid var(--c-border)',
    borderRadius: '8px',
    boxShadow: 'var(--sh-drag)',
    transform: 'rotate(-1.5deg)',
    pointerEvents: 'none',
  });
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(
    ghost,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
  // The browser has taken its picture by the next turn.
  setTimeout(() => ghost.remove(), 0);
}

export function DndProvider({
  children,
  api,
}: {
  children: ReactNode;
  api: {
    moveTab(tabId: number, spaceId: number | null, before: number | null): void;
    moveArtifactTab(
      id: number,
      spaceId: number | null,
      before: number | null,
    ): void;
    moveSpace(id: number, before: number | null): void;
    nudgeItem(kind: DragItem['kind'], id: number, direction: -1 | 1): void;
  };
}) {
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [over, setOver] = useState<DropAt | null>(null);
  const dragRef = useRef<DragItem | null>(null);
  const overRef = useRef<DropAt | null>(null);
  // An artifact from the panel is being dragged over the sidebar.
  const foreignRef = useRef(false);
  // After Alt+Up/Down the row is moved in the page, which can drop its focus.
  const refocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (refocus.current === null) return;
    const element = document.querySelector<HTMLElement>(
      `[data-dnd-key="${refocus.current}"]`,
    );
    refocus.current = null;
    element?.focus();
  });

  const setTarget = useCallback((at: DropAt | null) => {
    if (sameDrop(overRef.current, at)) return;
    overRef.current = at;
    setOver(at);
  }, []);

  const finish = useCallback(() => {
    foreignRef.current = false;
    dragRef.current = null;
    overRef.current = null;
    setDrag(null);
    setOver(null);
  }, []);

  const begin = useCallback(
    (item: DragItem, event: DragEvent, from: HTMLElement) => {
      event.dataTransfer.effectAllowed = 'move';
      // Some browsers refuse to drag without data.
      event.dataTransfer.setData('text/plain', keyOf(item));
      startGhost(event, from);
      dragRef.current = item;
      // Set after the browser has taken the ghost picture (the row fades then).
      setTimeout(() => setDrag(dragRef.current), 0);
    },
    [],
  );

  // What is being dragged over a spot: one of our own rows, or an artifact from the
  // panel (which needs the sidebar to start showing where it would land).
  const dragging = useCallback((event: DragEvent): DragItem | null => {
    if (dragRef.current) return dragRef.current;
    if (!hasArtifactDrag(event.dataTransfer.types)) return null;
    if (!foreignRef.current) {
      foreignRef.current = true;
      setDrag(FOREIGN_ARTIFACT);
    }
    return FOREIGN_ARTIFACT;
  }, []);

  // A drag from the panel that leaves the window, or is dropped somewhere else,
  // never reports back, so it is cleaned up here.
  useLayoutEffect(() => {
    const clear = () => {
      if (foreignRef.current) finish();
    };
    const left = (event: globalThis.DragEvent) => {
      if (event.relatedTarget === null) clear();
    };
    window.addEventListener('dragleave', left);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragleave', left);
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, [finish]);

  const drop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const at = overRef.current;
      let item = dragRef.current;
      // Dropped from the panel: now the artifact's number can be read.
      if (!item && foreignRef.current) {
        const id = readArtifactDrag(event.dataTransfer.getData(ARTIFACT_DRAG));
        item = id === null ? null : { kind: 'artifact', id };
      }
      finish();
      if (item && at) applyDrop(item, at, api);
    },
    [api, finish],
  );

  const value = useMemo<Dnd>(() => {
    const classFor = (own: DragItem | null, mark: 'before' | 'into' | null) =>
      [
        own && drag && drag.kind === own.kind && drag.id === own.id
          ? 'dnd-dragging'
          : '',
        mark === 'before' ? 'dnd-before' : '',
        mark === 'into' ? 'dnd-into' : '',
      ]
        .filter(Boolean)
        .join(' ');

    const keys = (item: DragItem) => (event: KeyboardEvent) => {
      if (!event.altKey || event.target !== event.currentTarget) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      event.stopPropagation();
      refocus.current = keyOf(item);
      api.nudgeItem(item.kind, item.id, event.key === 'ArrowUp' ? -1 : 1);
    };

    return {
      drag,
      over,
      itemProps: (item, place, options) => {
        const halves = options?.halves !== false;
        const before =
          over !== null &&
          drag !== null &&
          ((over.type === 'tab' &&
            item.kind === 'tab' &&
            over.beforeId === item.id) ||
            (over.type === 'artifact' &&
              item.kind === 'artifact' &&
              over.beforeId === item.id)) &&
          over.beforeId !== drag.id;
        return {
          className: classFor(item, before ? 'before' : null),
          draggable: true,
          'data-dnd-key': keyOf(item),
          onKeyDown: keys(item),
          onDragStart: (event) => {
            // A drag that starts on a button inside the row is not a row drag.
            begin(item, event, event.currentTarget as HTMLElement);
          },
          onDragEnd: finish,
          onDragOver: (event) => {
            const current = dragging(event);
            if (!current) return;
            const rect = (
              event.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const upper = !halves || event.clientY < rect.top + rect.height / 2;
            const at = dropForItem(current, item, place, upper);
            if (!at) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setTarget(at);
          },
          onDrop: drop,
        };
      },
      spaceProps: (spaceId, nextSpaceId) => {
        const mark =
          over?.type === 'into' && over.spaceId === spaceId
            ? 'into'
            : over?.type === 'space' && over.beforeId === spaceId
              ? 'before'
              : null;
        const own: DragItem = { kind: 'space', id: spaceId };
        return {
          className: classFor(own, mark),
          'data-dnd-key': keyOf(own),
          onKeyDown: keys(own),
          onDragOver: (event) => {
            const current = dragging(event);
            if (!current) return;
            const rect = (
              event.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const upper = event.clientY < rect.top + rect.height / 2;
            const at = dropForSpaceHeader(current, spaceId, nextSpaceId, upper);
            if (!at) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setTarget(at);
          },
          onDrop: drop,
          grip: {
            draggable: true,
            onDragStart: (event) => {
              const row = (event.currentTarget as HTMLElement).closest(
                '.lrow',
              ) as HTMLElement | null;
              begin(own, event, row ?? (event.currentTarget as HTMLElement));
            },
            onDragEnd: finish,
          },
        };
      },
      endSlot: (at) => {
        if (!drag) return null;
        // Only the kind of group the dragged thing can land in.
        const fits =
          (at.type === 'tab' && drag.kind === 'tab') ||
          (at.type === 'artifact' && drag.kind === 'artifact') ||
          (at.type === 'space' && drag.kind === 'space');
        if (!fits) return null;
        return (
          <div
            className={[
              'dnd-end',
              // The loose items' end is a roomier target: it is how a tab is taken
              // out of a Space.
              at.type !== 'space' && at.spaceId === null ? 'dnd-end-loose' : '',
              sameDrop(over, at) ? 'dnd-before' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setTarget(at);
            }}
            onDrop={drop}
          />
        );
      },
      backgroundProps: () => ({
        onDragOver: (event) => {
          const current = dragging(event);
          // Only the bare background, not a row or a header on top of it.
          if (!current || current.kind === 'space') return;
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setTarget({
            type: current.kind === 'tab' ? 'tab' : 'artifact',
            spaceId: null,
            beforeId: null,
          });
        },
        onDrop: drop,
      }),
    };
  }, [api, begin, drag, dragging, drop, finish, over, setTarget]);

  return <DndContext.Provider value={value}>{children}</DndContext.Provider>;
}
