// The logic of Settings > About > Updates, kept apart from Electron so it can be tested: the states an
// update goes through, how an event moves it on, and the words and button each state shows.
//
// How an update works (Windows, installed app): Cleave asks GitHub for the latest release's RELEASES
// file. If it lists a newer version, Squirrel (the installer's own updater) downloads it, checks it
// against the size and SHA-1 listed in RELEASES, and puts it next to the current version. Nothing
// changes for you until you restart Cleave, or open it again later.

// Where the latest release's update files are (a folder containing RELEASES and the .nupkg files).
// GitHub's "latest" address always points at the newest published release.
export const UPDATE_FEED =
  'https://github.com/atat26/cleave/releases/latest/download';

export type UpdateState =
  // Not an installed copy, so it cannot update itself.
  | { kind: 'unavailable'; why: 'development' | 'not-installed' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  // A newer version was found and is being downloaded and prepared.
  | { kind: 'downloading' }
  // Downloaded and prepared; it starts the next time Cleave starts. `version` is null if unknown.
  | { kind: 'ready'; version: string | null }
  | { kind: 'current' }
  | { kind: 'error'; message: string };

export type UpdateEvent =
  | { type: 'check-started' }
  | { type: 'found' }
  | { type: 'none' }
  | { type: 'downloaded'; version: string | null }
  | { type: 'failed'; message: string };

export function nextUpdateState(
  state: UpdateState,
  event: UpdateEvent,
): UpdateState {
  // A copy that cannot update stays that way, and a ready update is not undone by anything later.
  if (state.kind === 'unavailable' || state.kind === 'ready') return state;
  switch (event.type) {
    case 'check-started':
      return state.kind === 'checking' || state.kind === 'downloading'
        ? state
        : { kind: 'checking' };
    case 'found':
      return state.kind === 'checking' ? { kind: 'downloading' } : state;
    case 'none':
      return state.kind === 'checking' ? { kind: 'current' } : state;
    case 'downloaded':
      return { kind: 'ready', version: event.version };
    case 'failed':
      return { kind: 'error', message: event.message };
  }
}

// A version number from whatever the updater reports as the release name; null if it is not one.
export function versionFrom(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const match = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/.exec(name);
  return match ? match[0] : null;
}

// One short line about an error, without paths or stack traces.
export function plainError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const firstLine = raw.split(/\r?\n/)[0].trim();
  const withoutPaths = firstLine.replace(/[A-Za-z]:\\[^\s"']+/g, '…');
  if (withoutPaths === '') return 'something went wrong';
  return withoutPaths.length > 160
    ? `${withoutPaths.slice(0, 159)}…`
    : withoutPaths;
}

export type UpdateView = {
  text: string;
  // The one button to show, if any: what it says and what it does.
  button: { label: string; action: 'check' | 'install' } | null;
  // Something is happening: the button shows a spinner and cannot be used.
  busy: boolean;
};

export function describeUpdate(state: UpdateState): UpdateView {
  switch (state.kind) {
    case 'unavailable':
      return {
        text:
          state.why === 'development'
            ? 'Updates work in the installed app. This is a development copy.'
            : 'This copy was not set up by the Cleave installer, so it cannot update itself. Download the latest installer from the Releases page of the repository.',
        button: null,
        busy: false,
      };
    case 'idle':
      return {
        text: 'Check whether a newer version of Cleave is available.',
        button: { label: 'Check for updates', action: 'check' },
        busy: false,
      };
    case 'checking':
      return {
        text: 'Checking for updates…',
        button: { label: 'Check for updates', action: 'check' },
        busy: true,
      };
    case 'downloading':
      return {
        text: 'A newer version was found. Downloading it…',
        button: { label: 'Check for updates', action: 'check' },
        busy: true,
      };
    case 'ready':
      return {
        text:
          state.version === null
            ? 'A newer version is ready. Restart Cleave to start using it; it also starts the next time you open Cleave.'
            : `Version ${state.version} is ready. Restart Cleave to start using it; it also starts the next time you open Cleave.`,
        button: { label: 'Restart to update', action: 'install' },
        busy: false,
      };
    case 'current':
      return {
        text: 'You have the latest version.',
        button: { label: 'Check again', action: 'check' },
        busy: false,
      };
    case 'error':
      return {
        text: `Could not check for updates: ${state.message}.`,
        button: { label: 'Try again', action: 'check' },
        busy: false,
      };
  }
}
