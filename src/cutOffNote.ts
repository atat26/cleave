// A page the assistant reads is cut after MAX_PAGE_CHARS characters, and the model is told so, but
// the models tried so far still answer as if they had read all of it (scenario 2 in
// docs/pipeline/). So the app says it itself: when a page was cut and the answer does not already
// say so, a short note written by the app is added after the answer. Pure code, so it is tested.

// Words in an answer that already say a page was cut short (so the note is not repeated).
const SAYS_CUT =
  /cut (off|short)|truncat|partial|first part|only (read|the first|part)|not the (whole|entire)|incomplete|beginning of|rest of the page|part of the page|didn'?t (read|see) (all|the whole|the rest)|couldn'?t (read|see) (all|the whole|the rest)|20,?000/i;

// The note to add after the answer, or null. `pages` is how many pages read in this reply were cut.
export function cutOffNote(
  answer: string,
  pages: number,
  limit: number,
): string | null {
  if (pages <= 0 || answer.trim() === '' || SAYS_CUT.test(answer)) return null;
  const amount = limit.toLocaleString('en-US');
  return pages === 1
    ? `\n\n_Note from the app: that page was long, so only its first ${amount} characters were read._`
    : `\n\n_Note from the app: some of the pages read were long, so only the first ${amount} characters of each were read._`;
}
