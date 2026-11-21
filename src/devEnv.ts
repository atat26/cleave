// The AIB_ settings (AIB_TEST_SCOPE, AIB_TRACE, AIB_NO_PLAN...) exist for developing and testing Cleave. They
// only count in a copy started from the project folder (npm start, or the tests), never in the installed
// app: there, whatever is in the environment is ignored, so nothing that can set an environment variable
// for the installed app can change how it treats the assistant or what it writes to disk.
//
// The installed app is Electron running without being handed a project folder: `process.defaultApp` is
// only set when it was.

interface ProcessLike {
  versions?: { electron?: string };
  defaultApp?: boolean;
  env?: Record<string, string | undefined>;
}

export function isInstalledApp(
  proc: ProcessLike | undefined = globalProcess(),
): boolean {
  return proc?.versions?.electron !== undefined && proc.defaultApp !== true;
}

// The value of an AIB_ setting, or undefined (always undefined in the installed app).
export function devEnv(
  name: string,
  proc: ProcessLike | undefined = globalProcess(),
): string | undefined {
  if (proc === undefined || isInstalledApp(proc)) return undefined;
  return proc.env?.[name];
}

function globalProcess(): ProcessLike | undefined {
  return typeof process === 'undefined' ? undefined : (process as ProcessLike);
}
