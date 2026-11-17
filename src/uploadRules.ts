// What may be uploaded into the browser and what it becomes. A text file (notes, code,
// a web page, data) becomes a text artifact of the right kind; an image or a PDF
// becomes an artifact of kind "file" that can be viewed. Anything else is refused,
// with a plain reason. A file is also checked to really be what its name says (an
// ".png" that is not a picture is refused), so a renamed program cannot slip in as an
// image. Pure code: the app reads the file; these rules only look at its name, size
// and first bytes.
import { cleanTitle, kindFromName } from './artifacts.ts';
import type { TextArtifactKind } from './artifacts.ts';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// A text file's size in bytes is held to a bit over the character limit.
export const MAX_TEXT_UPLOAD_BYTES = 4 * 1024 * 1024;
// The picture kinds a pasted image can be (the app saves it under one of these).
export const PASTED_IMAGE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'gif',
  'webp',
  'bmp',
];
export const MAX_UPLOAD_FILES = 20;

export type UploadPlan =
  | { type: 'text'; kind: TextArtifactKind; title: string }
  | { type: 'file'; mime: string; ext: string; title: string; label: string }
  | { type: 'refused'; reason: string };

interface Viewable {
  mime: string;
  label: string;
  // The first bytes a real file of this kind starts with.
  starts: (head: Uint8Array) => boolean;
}

const bytes = (head: Uint8Array, at: number, text: string): boolean =>
  text.split('').every((ch, i) => head[at + i] === ch.charCodeAt(0));
const hex = (head: Uint8Array, values: number[]): boolean =>
  values.every((v, i) => head[i] === v);

const VIEWABLE: Record<string, Viewable> = {
  png: {
    mime: 'image/png',
    label: 'Image',
    starts: (h) => hex(h, [0x89, 0x50, 0x4e, 0x47]),
  },
  jpg: {
    mime: 'image/jpeg',
    label: 'Image',
    starts: (h) => hex(h, [0xff, 0xd8, 0xff]),
  },
  jpeg: {
    mime: 'image/jpeg',
    label: 'Image',
    starts: (h) => hex(h, [0xff, 0xd8, 0xff]),
  },
  gif: {
    mime: 'image/gif',
    label: 'Image',
    starts: (h) => bytes(h, 0, 'GIF8'),
  },
  webp: {
    mime: 'image/webp',
    label: 'Image',
    starts: (h) => bytes(h, 0, 'RIFF') && bytes(h, 8, 'WEBP'),
  },
  bmp: { mime: 'image/bmp', label: 'Image', starts: (h) => bytes(h, 0, 'BM') },
  pdf: {
    mime: 'application/pdf',
    label: 'PDF',
    starts: (h) => bytes(h, 0, '%PDF-'),
  },
};

const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

// What a file becomes, from its name, size and first bytes (at least 12 are needed).
export function planUpload(
  name: string,
  size: number,
  head: Uint8Array,
): UploadPlan {
  const base = name.split(/[\\/]/).pop() ?? '';
  const title = cleanTitle(base);
  if (!Number.isFinite(size) || size <= 0) {
    return { type: 'refused', reason: 'That file is empty.' };
  }
  const ext = extOf(base);
  const viewable = VIEWABLE[ext];
  if (viewable) {
    if (size > MAX_UPLOAD_BYTES) {
      return { type: 'refused', reason: 'That file is larger than 25 MB.' };
    }
    if (!viewable.starts(head)) {
      return {
        type: 'refused',
        reason: `That file is not really ${viewable.label === 'PDF' ? 'a PDF' : 'an image'}, whatever its name says.`,
      };
    }
    return {
      type: 'file',
      mime: viewable.mime,
      ext: ext === 'jpeg' ? 'jpg' : ext,
      title,
      label: viewable.label,
    };
  }
  const kind = kindFromName(base);
  if (kind === null) {
    return {
      type: 'refused',
      reason:
        'Only text, code, web page, image and PDF files can be added for now.',
    };
  }
  if (size > MAX_TEXT_UPLOAD_BYTES) {
    return {
      type: 'refused',
      reason: 'That text file is too large (the limit is about 4 MB).',
    };
  }
  // A text file has no zero bytes: one that does is something else.
  if (head.includes(0)) {
    return { type: 'refused', reason: 'That does not look like a text file.' };
  }
  return { type: 'text', kind, title };
}
