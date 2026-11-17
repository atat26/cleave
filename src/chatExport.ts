// A chat as a Markdown file: its name, when it was exported, what it was linked to,
// and the conversation (what you said and what the assistant answered, with a line
// for each step it took). Page text the assistant read is never in it (it is not
// kept), and neither is its thinking. Made for you to keep or share. Pure, so it is
// easy to test.
import type { Conversation } from './chats.ts';

// Text that is safe in a heading line or a link label.
const label = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\[\]`*_<>|])/g, '\\$1');

// An address without a username or password, or null if it is not a web address.
function plainAddress(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    parsed.username = '';
    parsed.password = '';
    return parsed.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch {
    return null;
  }
}

export function chatMarkdown(chat: Conversation, exportedAt: Date): string {
  const lines: string[] = [`# ${label(chat.title) || 'Chat'}`, ''];
  const facts = [`Exported ${exportedAt.toISOString().slice(0, 10)}`];
  if (chat.model) facts.push(`Model: ${label(chat.model)}`);
  lines.push(`_${facts.join(' · ')}_`, '');

  if (chat.refs.length > 0) {
    lines.push('## Linked', '');
    for (const ref of chat.refs) {
      const address = plainAddress(ref.url);
      const name = label(ref.title) || ref.kind;
      lines.push(
        address
          ? `- [${name}](${address})`
          : `- ${name} (${ref.kind === 'tab' ? 'page' : ref.kind})`,
      );
    }
    lines.push('');
  }

  const turns = chat.messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  );
  if (turns.length === 0) lines.push('_No messages yet._', '');
  for (const message of turns) {
    lines.push(message.role === 'user' ? '### You' : '### Assistant', '');
    if (message.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool') lines.push(`_${label(part.label)}_`, '');
      }
    }
    const text = message.content.trim();
    if (text !== '') lines.push(text, '');
    if (message.role === 'assistant') {
      if (message.status === 'stopped') lines.push('_(stopped)_', '');
      if (message.status === 'error') lines.push('_(this reply failed)_', '');
    }
  }
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
