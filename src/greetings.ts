// The line at the top of the new-tab page. It follows the time of day and the day of
// the week, and varies from tab to tab (the same tab always gets the same line).
// Pure code with no Electron, so it is easy to test. Plain, warm, a little playful;
// no emoji.

export type DayPart =
  | 'early'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night';

const BY_DAY_PART: Record<DayPart, string[]> = {
  early: [
    'Early start. The day is still unspoiled.',
    'Up before the inbox. Nice.',
    'Quiet hour. Good time for the hard thing.',
    'The coffee is optional. The curiosity is not.',
  ],
  morning: [
    'Good morning. What are we working on?',
    'Fresh page, fresh tab.',
    'Morning. The world is still loading.',
    'Let’s make something before lunch.',
  ],
  midday: [
    'Midday. Eat something, then back to it.',
    'Lunch break browsing, or lunch break plotting?',
    'Halfway through the day, plenty left.',
    'The sun is at its highest. So is your potential.',
  ],
  afternoon: [
    'Afternoon. The slump is optional.',
    'Second wind, loading.',
    'Still going. Respect.',
    'A good time to finish what you started.',
  ],
  evening: [
    'Evening. Wind down or wind up?',
    'The day is nearly done. One more thing?',
    'Good evening. Time to tie up loose tabs.',
    'Golden hour for good ideas.',
  ],
  night: [
    'Burning the midnight tab. We won’t tell.',
    'A late one. Make it count.',
    'The quiet hours are good for thinking.',
    'Night shift. Snacks recommended.',
  ],
};

// Index 0 is Sunday, as in Date#getDay.
const BY_WEEKDAY: string[][] = [
  ['Sunday. Slow tabs, big thoughts.', 'A Sunday for wandering.'],
  ['Monday. Gentle start, strong finish.', 'New week, clean slate.'],
  [
    'Tuesday. The week finds its feet.',
    'Two days in and momentum is building.',
  ],
  ['Midweek. You are doing fine.', 'Wednesday: it is downhill from here.'],
  ['Thursday. Nearly Friday, not quite.', 'Thursday, the Friday eve.'],
  [
    'It is Friday. Dream big, close tabs.',
    'Friday. The finish line is in sight.',
  ],
  [
    'Saturday. Browse like nobody is watching.',
    'Weekend mode: curiosity only.',
  ],
];

export function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour < 8) return 'early';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

// Every line that could show at this time (the time-of-day lines, then the
// day-of-week lines).
export function greetingChoices(now: Date): string[] {
  return [
    ...BY_DAY_PART[dayPartOf(now.getHours())],
    ...BY_WEEKDAY[now.getDay()],
  ];
}

// The line for a tab at this time; \`seed\` (the tab's number) picks among the choices.
export function greetingFor(now: Date, seed: number): string {
  const choices = greetingChoices(now);
  const at =
    ((Math.trunc(seed) % choices.length) + choices.length) % choices.length;
  return choices[at];
}

export const allGreetings = (): string[] => [
  ...Object.values(BY_DAY_PART).flat(),
  ...BY_WEEKDAY.flat(),
];
