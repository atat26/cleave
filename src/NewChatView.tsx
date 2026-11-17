import { useMemo } from 'react';
import { agoWords } from './overviewModel';
import { greetingFor } from './greetings';
import { ItemEmoji } from './ui/controls';
import type { ChatInfo, ChatsInfo, SpaceInfo } from './types';

// The screen for a chat nothing has been said in yet (shown while only the chat is
// on screen). It is the chat's twin of the new-tab page: a greeting, the message box
// (passed in as `box`), your recent chats to pick up again, and your Spaces to start
// a chat in.
const RECENT = 4;
const SPACE_PILLS = 8;

export function NewChatView({
  chats,
  chat,
  spaces,
  box,
}: {
  chats: ChatsInfo;
  chat: ChatInfo;
  spaces: SpaceInfo[];
  box: React.ReactNode;
}) {
  const greeting = useMemo(() => greetingFor(new Date(), chat.id), [chat.id]);
  const recent = chats.conversations
    .filter((c) => c.id !== chat.id && c.messageCount > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECENT);
  const linked = new Set(
    chats.refs.filter((r) => r.kind === 'space').map((r) => r.id),
  );

  return (
    <div className="newchat">
      <div className="nt-col">
        <h1>{greeting}</h1>
        {box}
        {spaces.length > 0 && (
          <div
            className="newchat-spaces"
            role="group"
            aria-label="Start in a Space"
          >
            {spaces.slice(0, SPACE_PILLS).map((space) => (
              <button
                key={space.id}
                type="button"
                className="nt-chip"
                aria-pressed={linked.has(space.id)}
                title={
                  linked.has(space.id)
                    ? `${space.name} is linked. Click to unlink.`
                    : `Link ${space.name} so the assistant can see its pages`
                }
                onClick={() =>
                  linked.has(space.id)
                    ? window.browserApi.chatUnlink(chat.id, 'space', space.id)
                    : window.browserApi.chatLink(chat.id, 'space', space.id)
                }
              >
                <ItemEmoji emoji={space.emoji} />
                <span className="truncate">{space.name}</span>
              </button>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <section className="nt-pick" aria-labelledby="newchat-pick-h">
            <div className="nt-pick-h">
              <span id="newchat-pick-h">Pick up</span>
            </div>
            <ul className="nt-pick-list">
              {recent.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="nt-pick-item newchat-item"
                    onClick={() => window.browserApi.selectChat(c.id)}
                  >
                    <ItemEmoji emoji={c.emoji} />
                    <span className="nt-item-title truncate">{c.title}</span>
                    {c.unread && (
                      <span className="nt-waiting">Reply waiting</span>
                    )}
                    <span className="nt-time">
                      {agoWords(c.updatedAt, Date.now())}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
