// Artifacts: documents made inside the browser (notes, drafts, pages of code).
// They are kept in artifacts.json in the app's data folder. Pure data and
// functions with no Electron, so it is easy to test. Uploaded files are a separate
// thing, to be added later.
import { cleanEmoji } from './emoji.ts';

// What kind of document it is. Every kind here has a text editor. Kinds that can
// only be previewed (PDFs, images) come back with uploads.
export const ARTIFACT_KINDS = ['markdown', 'text', 'html', 'code'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const MAX_ARTIFACT_CHARS = 1_000_000;
export const MAX_ARTIFACTS = 500;
export const MAX_TITLE_CHARS = 120;

export interface Artifact {
  id: number;
  title: string;
  kind: ArtifactKind;
  content: string;
  // Its emoji, or null to show the default for its kind (see emoji.ts).
  emoji: string | null;
  // The Space it belongs to, or null for one outside any Space.
  spaceId: number | null;
  createdAt: number;
  updatedAt: number;
  // Goes up each time the text changes (not for a rename or a move). A save that
  // was based on an older text is refused, so a stale editor can never overwrite
  // a newer text.
  revision: number;
}

export interface ArtifactsState {
  version: 1;
  nextId: number;
  artifacts: Artifact[];
}

export const defaultArtifacts = (): ArtifactsState => ({
  version: 1,
  nextId: 1,
  artifacts: [],
});

export const isArtifactKind = (value: unknown): value is ArtifactKind =>
  typeof value === 'string' &&
  (ARTIFACT_KINDS as readonly string[]).includes(value);

// Which kinds the editor can open. Today that is all of them.
export const canEdit = (kind: ArtifactKind): boolean => isArtifactKind(kind);

const KIND_BY_EXTENSION: Record<string, ArtifactKind> = {
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  html: 'html',
  htm: 'html',
  css: 'code',
  js: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  json: 'code',
  py: 'code',
  sh: 'code',
  csv: 'code',
  xml: 'code',
  yml: 'code',
  yaml: 'code',
  sql: 'code',
};

// The kind a file name suggests, or null when it cannot be an artifact (a PDF,
// an image, anything we have no editor or preview for), so it gets no tab.
export function kindFromName(name: string): ArtifactKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return KIND_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

export function cleanTitle(title: unknown): string {
  const text =
    typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  return (text || 'Untitled').slice(0, MAX_TITLE_CHARS);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

// Turn whatever is on disk into valid state: bad entries are dropped, duplicate
// ids are dropped, too-long content is cut. Never throws.
export function parseArtifacts(raw: unknown): ArtifactsState {
  const state = defaultArtifacts();
  if (!isRecord(raw) || !Array.isArray(raw.artifacts)) return state;
  const seen = new Set<number>();
  for (const item of raw.artifacts) {
    if (!isRecord(item)) continue;
    const { id, kind, content, spaceId } = item;
    if (!isCount(id) || id < 1 || seen.has(id)) continue;
    if (!isArtifactKind(kind) || typeof content !== 'string') continue;
    if (state.artifacts.length >= MAX_ARTIFACTS) break;
    seen.add(id);
    state.artifacts.push({
      id,
      title: cleanTitle(item.title),
      kind,
      content: content.slice(0, MAX_ARTIFACT_CHARS),
      emoji: cleanEmoji(item.emoji),
      spaceId: isCount(spaceId) ? spaceId : null,
      createdAt: isCount(item.createdAt) ? item.createdAt : 0,
      updatedAt: isCount(item.updatedAt) ? item.updatedAt : 0,
      revision: isCount(item.revision) ? item.revision : 0,
    });
  }
  const highest = Math.max(0, ...state.artifacts.map((a) => a.id));
  state.nextId = Math.max(isCount(raw.nextId) ? raw.nextId : 1, highest + 1);
  return state;
}

export type ArtifactResult =
  | { ok: true; state: ArtifactsState; artifact: Artifact }
  | { ok: false; reason: 'too-many' | 'too-long' | 'not-found' | 'bad-kind' };

export interface NewArtifact {
  title?: string;
  kind: string;
  content?: string;
  emoji?: string | null;
  spaceId?: number | null;
}

export function createArtifact(
  state: ArtifactsState,
  input: NewArtifact,
  now: number,
): ArtifactResult {
  if (!isArtifactKind(input.kind)) return { ok: false, reason: 'bad-kind' };
  const content = input.content ?? '';
  if (content.length > MAX_ARTIFACT_CHARS)
    return { ok: false, reason: 'too-long' };
  if (state.artifacts.length >= MAX_ARTIFACTS)
    return { ok: false, reason: 'too-many' };
  const artifact: Artifact = {
    id: state.nextId,
    title: cleanTitle(input.title),
    kind: input.kind,
    content,
    emoji: cleanEmoji(input.emoji),
    spaceId: input.spaceId ?? null,
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
  return {
    ok: true,
    artifact,
    state: {
      ...state,
      nextId: state.nextId + 1,
      artifacts: [...state.artifacts, artifact],
    },
  };
}

export const findArtifact = (
  state: ArtifactsState,
  id: number,
): Artifact | undefined => state.artifacts.find((a) => a.id === id);

export interface ArtifactChanges {
  title?: string;
  content?: string;
  // Move into a Space (a number) or out of every Space (null).
  spaceId?: number | null;
  // A new emoji (null = back to the default). Not a single emoji: ignored.
  emoji?: string | null;
}

export function updateArtifact(
  state: ArtifactsState,
  id: number,
  changes: ArtifactChanges,
  now: number,
): ArtifactResult {
  const old = findArtifact(state, id);
  if (!old) return { ok: false, reason: 'not-found' };
  if (
    changes.content !== undefined &&
    changes.content.length > MAX_ARTIFACT_CHARS
  ) {
    return { ok: false, reason: 'too-long' };
  }
  const artifact: Artifact = {
    ...old,
    title: changes.title === undefined ? old.title : cleanTitle(changes.title),
    content: changes.content ?? old.content,
    emoji:
      changes.emoji === undefined
        ? old.emoji
        : changes.emoji === null
          ? null
          : (cleanEmoji(changes.emoji) ?? old.emoji),
    spaceId: changes.spaceId === undefined ? old.spaceId : changes.spaceId,
    updatedAt: now,
    revision:
      changes.content !== undefined && changes.content !== old.content
        ? old.revision + 1
        : old.revision,
  };
  return {
    ok: true,
    artifact,
    state: {
      ...state,
      artifacts: state.artifacts.map((a) => (a.id === id ? artifact : a)),
    },
  };
}

export function deleteArtifact(
  state: ArtifactsState,
  id: number,
): ArtifactsState {
  if (!findArtifact(state, id)) return state;
  return { ...state, artifacts: state.artifacts.filter((a) => a.id !== id) };
}

// When a Space is deleted, its artifacts are kept, just no longer in a Space.
export function releaseSpace(
  state: ArtifactsState,
  spaceId: number,
): ArtifactsState {
  if (!state.artifacts.some((a) => a.spaceId === spaceId)) return state;
  return {
    ...state,
    artifacts: state.artifacts.map((a) =>
      a.spaceId === spaceId ? { ...a, spaceId: null } : a,
    ),
  };
}

// The artifacts in a Space, or (null) those outside every Space; newest edit first.
export function artifactsIn(
  state: ArtifactsState,
  spaceId: number | null,
): Artifact[] {
  return state.artifacts
    .filter((a) => a.spaceId === spaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.id - a.id);
}
