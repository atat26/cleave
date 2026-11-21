// Should the app refuse to start because Chromium's remote debugging was switched on? Pure, so it is
// tested. Only the installed app refuses, and only when it would be debugging the folder with your data
// (a start with --user-data-dir uses a folder of its own: that is how an installed build is tested).
export function refusesDebugging(start: {
  installed: boolean;
  debugPort: boolean;
  debugPipe: boolean;
  ownFolder: boolean;
}): boolean {
  return (
    start.installed && (start.debugPort || start.debugPipe) && !start.ownFolder
  );
}
