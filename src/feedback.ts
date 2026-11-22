// The official way to report a bug or note an annoyance: the project's issue list, through a form that
// is already filled in with the version and the Windows version. The addresses are built here, from
// fixed names and values the app itself knows, so nothing a page says can change where they point.
// (The list is public: the forms say not to paste anything private.)

export const REPO_URL = 'https://github.com/atat26/cleave';

export type FeedbackKind = 'bug' | 'annoyance';

const TEMPLATES: Record<FeedbackKind, string> = {
  bug: 'bug.yml',
  annoyance: 'annoyance.yml',
};

// The address of the new-issue form of this kind, with the version and system filled in.
export function feedbackUrl(
  kind: FeedbackKind,
  about: { version: string; system: string },
): string {
  const query = new URLSearchParams({
    template: TEMPLATES[kind],
    version: about.version.slice(0, 40),
    system: about.system.slice(0, 80),
  });
  return `${REPO_URL}/issues/new?${query.toString()}`;
}

// Where the list of what has been reported is.
export const ISSUES_URL = `${REPO_URL}/issues`;
