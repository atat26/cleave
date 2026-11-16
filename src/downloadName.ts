// File names for downloads. The name a site gives a download is text the site wrote,
// so before the app uses it to write a file on your computer it is made safe:
// no folders in it, nothing Windows refuses, nothing that disguises what the file is.
// Pure code with no Electron, so it is easy to test.

const MAX_NAME = 120;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
// Characters Windows does not allow in a file name, and control characters.
const BAD_CHARS = new RegExp('[<>:"/\\|?*\u0000-\u001f\u007f]', 'g');
// Invisible characters, and the ones that reorder text on screen (so a name can
// look like it ends in .jpg while it really ends in .exe). Written as escapes so
// they stay visible in this file.
const SNEAKY = new RegExp(
  '[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\u2028\u2029]',
  'g',
);

// The file name to use for what a site called its download. The ordinary
// "report.pdf" comes out unchanged; only something unsafe is altered. `fallback` is
// used when nothing is left.
export function cleanFileName(name: unknown, fallback = 'download'): string {
  let text = typeof name === 'string' ? name : '';
  // Only the last part: a name with folders in it never escapes the folder.
  text = text.replace(SNEAKY, '').split(/[\\/]/).pop() ?? '';
  text = text.replace(BAD_CHARS, '_').replace(/\s+/g, ' ');
  // Windows drops dots and spaces at the end (and a leading dot hides a file).
  text = text
    .replace(/[. ]+$/, '')
    .replace(/^[. ]+/, '')
    .trim();
  if (text === '') return fallback;
  // Keep the type (what follows the last dot) when shortening.
  const dot = text.lastIndexOf('.');
  const stem = dot > 0 ? text.slice(0, dot) : text;
  const ext = dot > 0 ? text.slice(dot) : '';
  let safeStem = stem.replace(/[. ]+$/, '');
  if (WINDOWS_RESERVED.test(safeStem)) safeStem = `_${safeStem}`;
  if (safeStem === '') safeStem = fallback;
  const room = Math.max(1, MAX_NAME - ext.length);
  if (safeStem.length > room) safeStem = safeStem.slice(0, room).trimEnd();
  return `${safeStem}${ext.slice(0, 40)}`;
}

// A name that is not taken: "report.pdf", then "report (1).pdf", "report (2).pdf"...
// `taken` says whether a name is already in use in the folder.
export function uniqueName(
  name: string,
  taken: (candidate: string) => boolean,
): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 10_000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

// Programs and scripts: opening one of these runs it, so the app asks first.
const RISKY_EXTENSIONS = new Set([
  'exe',
  'msi',
  'msp',
  'bat',
  'cmd',
  'com',
  'scr',
  'pif',
  'lnk',
  'url',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'cpl',
  'msc',
  'jar',
  'reg',
  'dll',
  'sys',
  'appx',
  'msix',
  'apk',
  'application',
  'gadget',
  'inf',
  'chm',
  'iso',
  'img',
  'vhd',
  'docm',
  'xlsm',
  'pptm',
  'dotm',
  'xlam',
]);

// Does opening this file risk running a program? Judged by every part after the
// first dot, so "invoice.pdf.exe" is risky and "archive.tar.gz" is not.
export function isRiskyFile(name: string): boolean {
  const parts = name.toLowerCase().split('.').slice(1);
  return parts.some((part) => RISKY_EXTENSIONS.has(part.trim()));
}
