// Artifacts: documents made inside the browser (notes, drafts, pages of code).
// They are kept in artifacts.json in the app's data folder. Pure data and
// functions with no Electron, so it is easy to test. An uploaded image or PDF is an
// artifact of kind "file": its bytes live in the app's uploads folder, not here.
import { cleanEmoji } from './emoji.ts';
import { isViewableExtension } from './uploadTypes.ts';

// What kind of document it is. The text kinds have an editor (and the assistant can
// read and write them); "file" is an uploaded image or PDF, which can only be viewed.
export const TEXT_ARTIFACT_KINDS = [
  'markdown',
  'text',
  'html',
  'code',
] as const;
export type TextArtifactKind = (typeof TEXT_ARTIFACT_KINDS)[number];
export const ARTIFACT_KINDS = [...TEXT_ARTIFACT_KINDS, 'file'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

// An uploaded file kept in the uploads folder (named by the artifact's number).
export interface StoredFile {
  // The name it had, for showing.
  name: string;
  mime: string;
  // The ending it is stored with ("png", "pdf").
  ext: string;
  bytes: number;
}

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
  // Set for kind "file": what was uploaded.
  file: StoredFile | null;
  // The version of the text (a `revision`) that you allowed to use the internet
  // in its preview, or null. It only counts while it equals the current revision,
  // so the moment the text changes any way but by your own typing (the assistant
  // edited it), the permission is gone. See `hasInternet`.
  internetFor: number | null;
}

// May this artifact's preview use the internet? Only the exact text you allowed.
export const hasInternet = (artifact: {
  revision: number;
  internetFor: number | null;
}): boolean => artifact.internetFor === artifact.revision;

// A deleted artifact, kept for a while so it can be brought back.
export interface TrashedArtifact extends Artifact {
  deletedAt: number;
}

export interface ArtifactsState {
  version: 1;
  nextId: number;
  artifacts: Artifact[];
  // Deleted artifacts (see restoreArtifact). Nothing else in the app looks here.
  trash: TrashedArtifact[];
}

// How many deleted artifacts are kept at most.
export const MAX_ARTIFACT_TRASH = 200;

export const defaultArtifacts = (): ArtifactsState => ({
  version: 1,
  nextId: 1,
  artifacts: [],
  trash: [],
});

export const isArtifactKind = (value: unknown): value is ArtifactKind =>
  typeof value === 'string' &&
  (ARTIFACT_KINDS as readonly string[]).includes(value);

// Which kinds the editor can open: the text ones.
export const canEdit = (kind: ArtifactKind): boolean => kind !== 'file';

const MIME = /^[a-z]+\/[a-z0-9.+-]{1,40}$/;
const EXT = /^[a-z0-9]{1,5}$/;
// A stored file's details from disk or from the app, or null if they are not valid.
export function cleanStoredFile(value: unknown): StoredFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const f = value as Record<string, unknown>;
  if (typeof f.name !== 'string' || typeof f.mime !== 'string') return null;
  // Only an image or a PDF: a saved file of any other kind is never opened with another program.
  if (!isViewableExtension(f.ext) || !EXT.test(f.ext) || !MIME.test(f.mime))
    return null;
  if (typeof f.bytes !== 'number' || !Number.isInteger(f.bytes) || f.bytes < 0)
    return null;
  return {
    name: f.name.slice(0, 200),
    mime: f.mime,
    ext: f.ext,
    bytes: f.bytes,
  };
}

const KIND_BY_EXTENSION: Record<string, TextArtifactKind> = {
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
export function kindFromName(name: string): TextArtifactKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return KIND_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

// What an uploaded file is called in lists ("Image", "PDF"), or null for a text artifact.
export function fileLabel(artifact: {
  file: StoredFile | null;
}): string | null {
  if (artifact.file === null) return null;
  return artifact.file.mime === 'application/pdf' ? 'PDF' : 'Image';
}

// A size in bytes, as people say it ("340 KB", "2.1 MB").
export function byteWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
// One saved artifact, checked (null if it is not usable).
function parseArtifact(item: unknown): Artifact | null {
  if (!isRecord(item)) return null;
  const { id, kind, content, spaceId } = item;
  if (!isCount(id) || id < 1) return null;
  if (!isArtifactKind(kind) || typeof content !== 'string') return null;
  // An uploaded file needs its details; a text artifact never has any (a stray
  // field on one is ignored).
  const file = kind === 'file' ? cleanStoredFile(item.file) : null;
  if (kind === 'file' && file === null) return null;
  return {
    id,
    title: cleanTitle(item.title),
    kind,
    content: content.slice(0, MAX_ARTIFACT_CHARS),
    emoji: cleanEmoji(item.emoji),
    spaceId: isCount(spaceId) ? spaceId : null,
    createdAt: isCount(item.createdAt) ? item.createdAt : 0,
    updatedAt: isCount(item.updatedAt) ? item.updatedAt : 0,
    revision: isCount(item.revision) ? item.revision : 0,
    file,
    internetFor: isCount(item.internetFor) ? item.internetFor : null,
  };
}

export function parseArtifacts(raw: unknown): ArtifactsState {
  const state = defaultArtifacts();
  if (!isRecord(raw) || !Array.isArray(raw.artifacts)) return state;
  const seen = new Set<number>();
  for (const item of raw.artifacts) {
    if (state.artifacts.length >= MAX_ARTIFACTS) break;
    const artifact = parseArtifact(item);
    if (!artifact || seen.has(artifact.id)) continue;
    seen.add(artifact.id);
    state.artifacts.push(artifact);
  }
  // Deleted artifacts waiting in the trash (their ids never overlap the live ones).
  if (Array.isArray(raw.trash)) {
    for (const item of raw.trash) {
      if (state.trash.length >= MAX_ARTIFACT_TRASH) break;
      const artifact = parseArtifact(item);
      if (!artifact || seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      const deletedAt = (item as { deletedAt?: unknown }).deletedAt;
      state.trash.push({
        ...artifact,
        deletedAt: isCount(deletedAt) ? deletedAt : 0,
      });
    }
  }
  const highest = Math.max(0, ...seen);
  state.nextId = Math.max(isCount(raw.nextId) ? raw.nextId : 1, highest + 1);
  return state;
}

export type ArtifactResult =
  | { ok: true; state: ArtifactsState; artifact: Artifact }
  | { ok: false; reason: 'too-many' | 'too-long' | 'not-found' | 'bad-kind' };

export interface NewArtifact {
  title?: string;
  kind: string;
  // Required for (and only for) kind "file".
  file?: StoredFile;
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
  const file = input.kind === 'file' ? cleanStoredFile(input.file) : null;
  if ((input.kind === 'file') !== (file !== null)) {
    return { ok: false, reason: 'bad-kind' };
  }
  const content = input.kind === 'file' ? '' : (input.content ?? '');
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
    file,
    internetFor: null,
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
  // Set only for your own typing in the editor: if the internet was allowed for
  // the text before, it stays allowed for the text you changed it to. Every other
  // change of the text (the assistant's edits) leaves the permission behind.
  keepInternet?: boolean;
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
  // An uploaded file has no text to change.
  if (old.kind === 'file') changes = { ...changes, content: undefined };
  const revision =
    changes.content !== undefined && changes.content !== old.content
      ? old.revision + 1
      : old.revision;
  const artifact: Artifact = {
    ...old,
    internetFor:
      changes.keepInternet === true &&
      hasInternet(old) &&
      revision !== old.revision
        ? revision
        : old.internetFor,
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
    revision,
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

// Allow (or stop allowing) the internet in an artifact's preview, for the text it
// has right now. Nothing else about it changes.
export function setArtifactInternet(
  state: ArtifactsState,
  id: number,
  on: boolean,
): ArtifactResult {
  const old = findArtifact(state, id);
  if (!old) return { ok: false, reason: 'not-found' };
  if (hasInternet(old) === on) return { ok: true, artifact: old, state };
  const artifact: Artifact = { ...old, internetFor: on ? old.revision : null };
  return {
    ok: true,
    artifact,
    state: {
      ...state,
      artifacts: state.artifacts.map((a) => (a.id === id ? artifact : a)),
    },
  };
}

// Delete an artifact. It is not gone for good: it waits in the trash (the oldest
// go if the trash is full) and can be brought back.
export function deleteArtifact(
  state: ArtifactsState,
  id: number,
  now = Date.now(),
): ArtifactsState {
  const found = findArtifact(state, id);
  if (!found) return state;
  return {
    ...state,
    artifacts: state.artifacts.filter((a) => a.id !== id),
    trash: [...state.trash, { ...found, deletedAt: now }].slice(
      -MAX_ARTIFACT_TRASH,
    ),
  };
}

// Bring a deleted artifact back, with its text, name and emoji. It returns to its
// Space if that Space still exists (`spaceExists`), otherwise to no Space. Nothing
// happens if it is not in the trash or there is no room.
export function restoreArtifact(
  state: ArtifactsState,
  id: number,
  spaceExists: (spaceId: number) => boolean,
): ArtifactsState {
  const found = state.trash.find((a) => a.id === id);
  if (!found || state.artifacts.length >= MAX_ARTIFACTS) return state;
  const { deletedAt: _deletedAt, ...artifact } = found;
  return {
    ...state,
    artifacts: [
      ...state.artifacts,
      {
        ...artifact,
        spaceId:
          artifact.spaceId !== null && spaceExists(artifact.spaceId)
            ? artifact.spaceId
            : null,
      },
    ],
    trash: state.trash.filter((a) => a.id !== id),
  };
}

// Delete an artifact in the trash for good.
export function purgeArtifact(
  state: ArtifactsState,
  id: number,
): ArtifactsState {
  return state.trash.some((a) => a.id === id)
    ? { ...state, trash: state.trash.filter((a) => a.id !== id) }
    : state;
}

export function emptyArtifactTrash(state: ArtifactsState): ArtifactsState {
  return state.trash.length === 0 ? state : { ...state, trash: [] };
}

// Remove the artifacts that have been in the trash longer than `days`.
export function purgeOldArtifacts(
  state: ArtifactsState,
  now: number,
  days: number,
): ArtifactsState {
  const oldest = now - days * 24 * 60 * 60_000;
  const trash = state.trash.filter((a) => a.deletedAt >= oldest);
  return trash.length === state.trash.length ? state : { ...state, trash };
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

// Artifacts that belong to a Space that no longer exists (an older version, or a Space that went away
// some other way) are put outside every Space, so they show in the panel again.
export function releaseMissingSpaces(
  state: ArtifactsState,
  spaceIds: readonly number[],
): ArtifactsState {
  const known = new Set(spaceIds);
  if (
    !state.artifacts.some((a) => a.spaceId !== null && !known.has(a.spaceId))
  ) {
    return state;
  }
  return {
    ...state,
    artifacts: state.artifacts.map((a) =>
      a.spaceId !== null && !known.has(a.spaceId) ? { ...a, spaceId: null } : a,
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
