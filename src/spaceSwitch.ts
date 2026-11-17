// Moving between Spaces quickly: Alt+1 to Alt+9 go to the Space at that place in
// the sidebar, Alt+Down and Alt+Up to the next and the previous one, and a switcher
// menu lists them all. Going to a Space lands on the page you were last on there,
// or on its overview if there is none. Pure, so it is easy to test.

// The Space after (step 1) or before (step -1) the current one, wrapping round at the
// ends. Without a current Space it is the first (or the last, going back). Null if
// there are no Spaces.
export function neighborSpaceId(
  ids: number[],
  current: number | null,
  step: 1 | -1,
): number | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return step === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(at + step + ids.length) % ids.length];
}

// The Space at place `n` (1 is the first); null if there is none.
export function spaceIdByNumber(ids: number[], n: number): number | null {
  if (!Number.isInteger(n) || n < 1 || n > ids.length) return null;
  return ids[n - 1];
}

// The page to land on when going to a Space: the one you were last on there if it
// is still open, else the first open page in it, else none (the overview).
export function landingTab(
  tabs: { id: number; spaceId: number | null; closed: boolean }[],
  spaceId: number,
  last: number | undefined,
): number | null {
  const inSpace = tabs.filter((t) => t.spaceId === spaceId && !t.closed);
  if (last !== undefined && inSpace.some((t) => t.id === last)) return last;
  return inSpace[0]?.id ?? null;
}
