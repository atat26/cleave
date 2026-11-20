# Changes 14: looking back in a long chat, and planning as an optional tool group

Follow-on to `changes-13.md`. Two things: the assistant can now look up the messages of a long chat that are no longer
sent to it, with a quiet line in the chat showing where what it sees begins; and `set_plan` is no longer in the tools sent
with every request. `deepseek/deepseek-v4.1-flash` in small paid tests, about $0.03 in all.

## Looking back in a long chat

The assistant is sent the last 30 messages of a chat, or about 60,000 characters. The ones before are saved and on your
screen but not sent. Until now it could only say it could not see them (`changes-12.md`), and you had to type the thing
again.

- **A tool, `earlier_in_this_chat`.** It gets one of two arguments: `query` (words to look for: any of them matches, and
  messages with more of them come first) or `from` (a message number, to read in order, in parts of about 12,000
  characters). It only reads the messages that are left out, from this chat. Other chats stay the job of `search_chats`
  and `read_chat`.
- **It costs nothing in an ordinary chat.** It is offered only while something is left out of the chat, so a short chat
  never sees it. The note that tells the assistant about the left-out messages now points to the tool ("look it up with
  `earlier_in_this_chat`; if it is not there, say so"), and still says not to search other chats.
- **Safe by the same rules as chat search.** What comes back is marked as old conversation and data, not instructions
  (earlier replies can hold text that came from web pages), and counts as web content read in the reply, so writing a
  document afterwards asks again. It asks by default like `search_chats`, can be turned off in the Tools panel, is limited
  to 4 look-ups per reply, and each result is cut to size. It shows as "your own data" in the steps.
- **The line in the chat.** In a long chat a thin divider reads "Messages above are no longer sent to the assistant", above
  the first message that is sent. No button; it moves down as the chat grows. It uses the same function that chooses what is
  sent (`firstSentIndex`), so it cannot disagree with reality.

### What the tests found

| Scenario                                                                                 | Before                                                     | Now                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 24: a dog's name set in turn 1, asked in turn 22 after the start is gone                 | "no record", or searched other chats (up to 15,385 tokens) | 3 of 3 runs look it up once or twice, give both facts, touch no other chat; 62,000 tokens for the whole 22-turn chat |
| 25: a code word in a 15,000-character first message, asked after the start is pushed out | said it could no longer see it                             | 3 of 3 runs find it by looking back                                                                                  |
| 33: a question that does not need the start (after the same long chat)                   | -                                                          | 4 of 4: no look-up, no tool call at all                                                                              |

One bug was found by a unit test: the first search needed all of its words (the shared forgiving search wants every word
when there are one or two), so "dog name" missed "my dog is called Biscuit". This search takes any word and ranks by how
many match.

## Planning as a tool group

`changes-13.md` found that always sending the plan tool and rule costs about 330 tokens (13%) on every request, even a plain
question. Now:

- `set_plan` is in its own group, **plan**. The group opens by itself when the message reads like a sequence ("then",
  "afterwards", "after that", "finally", "one by one", "step by step", or a numbered list), when planning was already used in
  the chat, or when the assistant asks for it (the group is listed in `more_tools`).
- The planning rule ("state a plan first, alone, wait for the user's answer") is added to the system message only when the
  group is open (`howToWork` in `chatContext.ts`).
- Without the rule, the tool's description alone was not enough: the assistant planned in 0 of 4 runs of the four-piece task.
  With the rule when the group is open: **3 of 4 plan and do the work** (the fourth stopped after the first step to
  ask about the fixture pages), a short two-read task makes no plan (4 of 4), and a declined plan holds back the work (4 of 4).
- **Cost:** a plain question is about 2,500 tokens, the same as with planning off (it was 2,800 to 2,900 with the tool
  always sent); the short two-read task went from about 8,700 to about 8,050.

## Not done

- A way to see exactly what was sent to the model for a message.
- Chats long enough to need a second part: one look-up returns up to 12,000 characters, further parts with `from`; the
  assistant used one or two look-ups in the tests, never the limit of four.
