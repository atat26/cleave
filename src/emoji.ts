// The little picture ("icon") of a chat, a Space or an artifact: one emoji. Pure
// code with no Electron, so it is easy to test. An item with no emoji of its own
// shows a default one. Whatever comes from the disk, the UI, or the assistant is
// checked here, so only a real single emoji is ever kept.

// What an item shows until it is given one.
export const DEFAULT_SPACE_EMOJI = '📁';
export const DEFAULT_CHAT_EMOJI = '💬';
const DEFAULT_ARTIFACT_EMOJI: Record<string, string> = {
  markdown: '📝',
  text: '📄',
  html: '🌐',
  code: '💻',
};
export const defaultArtifactEmoji = (kind: string): string =>
  DEFAULT_ARTIFACT_EMOJI[kind] ?? '📄';

const MAX_EMOJI_LENGTH = 24;
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

// A single emoji (including ones made of several parts, like a flag or a person
// with a skin tone), or null. Plain letters, digits and longer text are refused.
export function cleanEmoji(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || text.length > MAX_EMOJI_LENGTH) return null;
  if ([...segmenter.segment(text)].length !== 1) return null;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text)
    ? text
    : null;
}

// The emoji to show: its own, or the default.
export const emojiOr = (value: unknown, fallback: string): string =>
  cleanEmoji(value) ?? fallback;

// The picker's choices, in groups.
export const EMOJI_GROUPS: { name: string; emojis: string[] }[] = [
  {
    name: 'Work',
    emojis: [
      '📁',
      '📂',
      '🗂️',
      '📝',
      '📄',
      '📋',
      '📌',
      '📎',
      '📊',
      '📈',
      '📅',
      '🧾',
      '💼',
      '🧮',
      '🔬',
      '🧪',
      '⚙️',
      '🛠️',
      '💻',
      '🖥️',
      '📱',
      '🔒',
      '🔑',
      '💡',
    ],
  },
  {
    name: 'Places and travel',
    emojis: [
      '🏠',
      '🏢',
      '🏫',
      '🏥',
      '🏖️',
      '🏔️',
      '🗺️',
      '🧭',
      '✈️',
      '🚗',
      '🚆',
      '🚲',
      '⛵',
      '🌍',
      '🌆',
      '🏕️',
    ],
  },
  {
    name: 'Fun and life',
    emojis: [
      '🎮',
      '🎵',
      '🎬',
      '📚',
      '🎨',
      '📷',
      '⚽',
      '🏀',
      '🎯',
      '🎁',
      '🛒',
      '💰',
      '🍳',
      '🍕',
      '☕',
      '🍎',
      '🥗',
      '🎂',
      '❤️',
      '⭐',
      '🔥',
      '🚀',
      '🎉',
      '💬',
    ],
  },
  {
    name: 'Nature and animals',
    emojis: [
      '🌱',
      '🌳',
      '🌸',
      '🌻',
      '🌈',
      '☀️',
      '🌙',
      '⛅',
      '❄️',
      '🐶',
      '🐱',
      '🦊',
      '🐻',
      '🐼',
      '🦉',
      '🐝',
    ],
  },
  {
    name: 'Faces and signs',
    emojis: [
      '😀',
      '😎',
      '🤔',
      '🤖',
      '👀',
      '👍',
      '🙌',
      '🧠',
      '✅',
      '❗',
      '❓',
      '🔔',
      '🏆',
      '🎓',
      '🧩',
      '♻️',
    ],
  },
];
