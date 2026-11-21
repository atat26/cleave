// The kinds of file Cleave keeps from an upload and can show (an image or a PDF), by extension as it
// is saved ("jpeg" is saved as "jpg"). One list, used by the upload rules, by what is read back from
// disk (artifacts.json), by backups, and before a saved file is opened with another program, so a
// file with any other kind of name (an .exe, say) can never be reached as an "upload".
export const VIEWABLE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
];

export const isViewableExtension = (ext: unknown): ext is string =>
  typeof ext === 'string' && VIEWABLE_EXTENSIONS.includes(ext);
