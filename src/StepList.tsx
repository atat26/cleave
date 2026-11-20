// What the assistant is doing, drawn in the chat: each tool call as a step (a status
// icon, what it did with its target in bold, how it ended, and the site), runs of page
// reads folded into one line, and the run bar that says at a glance whether it is
// working, waiting for you, finished, stopped or stuck. The words and states come
// from runModel.ts; the look is in components.css (.step, .run-bar).
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  answerFor,
  badgesFor,
  cardMayTakeFocus,
  nextLine,
} from './approvalCard';
import {
  canRetry,
  groupState,
  groupTitle,
  LIMIT_WORDS,
  RUN_WORDS,
  runningNote,
  STATE_WORDS,
  stepSite,
  stepView,
} from './runModel';
import type { RunView, StepState, StepView, ToolPartView } from './runModel';
import type { CardDetails } from './approvalCard';
import { isThumbnailUrl } from './thumbnails';
import type { ChatMessage } from './chats';
import type { TabInfo } from './types';
import { Badge, Button, IconButton } from './ui/controls';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/Icon';

const STATE_ICON: Record<StepState, IconName> = {
  running: 'spinner',
  waiting: 'clock',
  done: 'check',
  declined: 'ban',
  blocked: 'shield',
  failed: 'warn',
  stopped: 'stop',
};

// A small status mark: the icon says the state even without its colour.
export function StatusIcon({ state }: { state: StepState }) {
  return (
    <span
      className="st"
      data-state={state}
      role="img"
      aria-label={STATE_WORDS[state]}
    >
      <Icon name={STATE_ICON[state]} />
    </span>
  );
}

// A site's small icon and name.
function SiteChip({ host, favicon }: { host: string; favicon: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="step-site" title={host}>
      {favicon && !broken ? (
        <img
          src={favicon}
          alt=""
          width={14}
          height={14}
          onError={() => setBroken(true)}
        />
      ) : (
        <Icon name="globe" />
      )}
      <span className="truncate">{host}</span>
    </span>
  );
}

// The words of a step: "Read: <b>Best Buy</b>".
function StepWords({ verb, target }: { verb: string; target: string | null }) {
  return (
    <span className="step-line truncate">
      {verb}
      {target !== null && (
        <>
          : <strong>{target}</strong>
        </>
      )}
    </span>
  );
}

// What was called, found and said: the raw detail of a step.
function StepDetails({ step }: { step: StepView }) {
  const { part } = step;
  return (
    <dl className="tool-detail">
      <dt>Called</dt>
      <dd>{part.name || '(unknown)'}</dd>
      <dt>Arguments</dt>
      <dd style={{ whiteSpace: 'pre-wrap' }}>
        {showArguments(part.arguments)}
      </dd>
      {part.details !== '' && (
        <>
          <dt>Found</dt>
          <dd
            style={{
              whiteSpace: 'pre-wrap',
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {part.details}
          </dd>
        </>
      )}
      {part.ask !== '' && (
        <>
          <dt>Asked</dt>
          <dd>{part.ask}</dd>
        </>
      )}
      <dt>Result</dt>
      <dd>
        {step.state === 'running'
          ? 'still running'
          : part.outcome ||
            (step.state === 'done'
              ? 'done'
              : STATE_WORDS[step.state].toLowerCase())}
      </dd>
      {part.callId !== '' && (
        <>
          <dt>Call id</dt>
          <dd style={{ color: 'var(--c-text-3)' }}>{part.callId}</dd>
        </>
      )}
    </dl>
  );
}

// The arguments as the model wrote them, tidied when they are JSON.
function showArguments(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// The small picture of a screenshot the assistant took, under its step. It is kept in memory for this
// session only (see thumbnails.ts), so after a restart there is none and nothing is shown.
function StepThumbnail({
  chatId,
  messageId,
  partId,
}: {
  chatId: number;
  messageId: number;
  partId: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void window.browserApi
      .chatThumbnail(chatId, messageId, partId)
      .then((found) => {
        if (live) setUrl(isThumbnailUrl(found) ? found : null);
      });
    return () => {
      live = false;
    };
  }, [chatId, messageId, partId]);
  if (url === null) return null;
  return (
    <div className="step-thumb">
      <img
        src={url}
        alt="The screenshot the assistant took"
        width={84}
        height={52}
      />
      <span>Kept for this session only</span>
    </div>
  );
}

// One step. Click (or Enter) shows the details; "Try again" and the details arrow show
// when the pointer or the keyboard is on the row; the right-click menu has both.
export function StepRow({
  step,
  chatId,
  messageId,
  tabs,
  isNewestReply,
  busy,
  nested = false,
}: {
  step: StepView;
  chatId: number;
  messageId: number;
  tabs: TabInfo[];
  isNewestReply: boolean;
  busy: boolean;
  nested?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const site = stepSite(step.part, tabs);
  const retry = canRetry(step, isNewestReply, busy);
  // Still running: what it is waiting on (the page loading), and whether the tab was asleep.
  const note = runningNote(step, tabs);

  // "Show details" from the right-click menu.
  useEffect(
    () =>
      window.browserApi.onStepToggle((message, part) => {
        if (message === messageId && part === step.part.id) {
          setOpen((o) => !o);
        }
      }),
    [step.part.id, messageId],
  );

  return (
    <div
      className={nested ? 'step reveal-host is-nested' : 'step reveal-host'}
      data-state={step.state}
      onContextMenu={(event) => {
        event.preventDefault();
        // The reply's own menu (Copy message) is not wanted on a step.
        event.stopPropagation();
        window.browserApi.showStepMenu(
          chatId,
          messageId,
          step.part.id,
          event.clientX,
          event.clientY,
          { retry, open },
        );
      }}
    >
      <button
        type="button"
        className="step-main"
        aria-expanded={open}
        title={open ? 'Hide what was called' : 'Show what was called'}
        onClick={() => setOpen((o) => !o)}
      >
        <StatusIcon state={step.state} />
        <span className="step-text">
          <StepWords verb={step.verb} target={step.target} />
          {step.result !== '' && (
            <span className="step-result truncate">{step.result}</span>
          )}
          {step.result === '' && note !== null && note.line !== '' && (
            <span className="step-result truncate">{note.line}</span>
          )}
        </span>
        {note?.asleep && <span className="step-tag">Was asleep</span>}
        {step.allowed && <span className="step-tag">Allowed</span>}
        {step.state === 'declined' && (
          <span className="step-tag">Declined by you</span>
        )}
        {site && <SiteChip host={site.host} favicon={site.favicon} />}
        <span className="step-chev" aria-hidden="true">
          <Icon name={open ? 'chev-u' : 'chev-d'} />
        </span>
      </button>
      {retry && (
        <Button
          size="sm"
          variant="ghost"
          className="reveal"
          title="Ask the assistant to try this step again"
          onClick={() =>
            window.browserApi.chatRetryStep(chatId, messageId, step.part.id)
          }
        >
          Try again
        </Button>
      )}
      {step.part.name === 'screenshot_page' && step.state === 'done' && (
        <StepThumbnail
          chatId={chatId}
          messageId={messageId}
          partId={step.part.id}
        />
      )}
      {open && <StepDetails step={step} />}
    </div>
  );
}

// Three or more page reads in a row, as one line that opens to the steps.
export function StepGroup({
  parts,
  message,
  chatId,
  tabs,
  isNewestReply,
  busy,
}: {
  parts: ToolPartView[];
  message: ChatMessage;
  chatId: number;
  tabs: TabInfo[];
  isNewestReply: boolean;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const steps = parts.map((p) => stepView(p, message.status));
  const state = groupState(steps);
  const { title, progress } = groupTitle(steps);
  const icons = [
    ...new Map(
      steps
        .map((s) => stepSite(s.part, tabs))
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .map((s) => [s.host, s]),
    ).values(),
  ].slice(0, 3);
  return (
    <div className="step step-group" data-state={state}>
      <button
        type="button"
        className="step-main"
        aria-expanded={open}
        title={open ? 'Hide the steps' : 'Show the steps'}
        onClick={() => setOpen((o) => !o)}
      >
        <StatusIcon state={state} />
        <span className="step-text">
          <span className="step-line truncate">
            <strong>{title}</strong>
          </span>
          {progress !== '' && (
            <span className="step-result truncate">{progress}</span>
          )}
        </span>
        {icons.length > 0 && (
          <span className="step-faces" aria-hidden="true">
            {icons.map((s) => (
              <FaceIcon key={s.host} favicon={s.favicon} />
            ))}
          </span>
        )}
        <span className="step-chev" aria-hidden="true">
          <Icon name={open ? 'chev-u' : 'chev-d'} />
        </span>
      </button>
      {open && (
        <div className="step-children">
          {steps.map((s) => (
            <StepRow
              key={s.part.id}
              step={s}
              chatId={chatId}
              messageId={message.id}
              tabs={tabs}
              isNewestReply={isNewestReply}
              busy={busy}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FaceIcon({ favicon }: { favicon: string | null }) {
  const [broken, setBroken] = useState(false);
  return favicon && !broken ? (
    <img
      src={favicon}
      alt=""
      width={14}
      height={14}
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="step-face-globe">
      <Icon name="globe" />
    </span>
  );
}

// ---- The run bar ---------------------------------------------------------------------

const RUN_ICON: Record<RunView['word'], StepState> = {
  working: 'running',
  waiting: 'waiting',
  stuck: 'failed',
  finished: 'done',
  stopped: 'stopped',
};

// One line above the message box: its state in a word, what it is doing, and a tick for
// each step so far. It has no Stop of its own: Stop is on the message box below it (or on
// the page's pill), once, not twice. When it has finished, stopped or got stuck it stays
// until you dismiss it (the x, or Esc) or send your next message.
export function RunBar({
  run,
  onDismiss,
  onContinue,
}: {
  run: RunView;
  onDismiss: () => void;
  // After a Stop: start a new reply that carries on. (The one visible action of a stopped run.)
  onContinue?: () => void;
}) {
  const active = run.word === 'working' || run.word === 'waiting';
  const icon: ReactNode = <StatusIcon state={RUN_ICON[run.word]} />;
  return (
    <div
      className="run-bar reveal-host"
      data-word={run.word}
      role="status"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !active) onDismiss();
      }}
    >
      {icon}
      <span className="run-word">{RUN_WORDS[run.word]}</span>
      <span className="run-what truncate">
        {run.verb}
        {run.target !== null && (
          <>
            : <strong>{run.target}</strong>
          </>
        )}
      </span>
      <span className="run-ticks" aria-hidden="true">
        {run.ticks.map((state, i) => (
          <span key={i} className="run-tick" data-state={state} />
        ))}
      </span>
      <span className="run-pos">
        {active
          ? `Step ${run.stepNumber}`
          : `${run.ticks.length} step${run.ticks.length === 1 ? '' : 's'}`}
      </span>
      {run.word === 'stopped' && onContinue && (
        <Button
          size="sm"
          onClick={onContinue}
          title="Carry on where it stopped"
        >
          Continue
        </Button>
      )}
      {!active && (
        <IconButton
          icon="x"
          size="sm"
          className="reveal"
          label="Dismiss (Esc)"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}

// After a reply used up one of its limits (the actions it may take, or the pages it may read): a
// neutral line, and a way to go on in a new reply (which has fresh limits) or to leave it there.
export function LimitBanner({
  limit,
  onContinue,
  onDone,
}: {
  limit: NonNullable<RunView['limit']>;
  onContinue: () => void;
  onDone: () => void;
}) {
  return (
    <div className="limit-banner" role="status">
      <span className="limit-what">
        {LIMIT_WORDS[limit]} Carry on if there is more to do.
      </span>
      <Button size="sm" onClick={onContinue}>
        Continue
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        That's enough
      </Button>
    </div>
  );
}

// With only the chat on screen the page is out of sight, so under the run bar a small card says
// which page the assistant is on: its site, its title and its Space. Clicking it shows the page.
export function WorkingOnCard({
  tab,
  spaceName,
}: {
  tab: { title: string; url: string; favicon: string | null };
  spaceName: string | null;
}) {
  let host = '';
  try {
    host = new URL(tab.url).host.replace(/^www\./i, '');
  } catch {
    host = '';
  }
  return (
    <button
      type="button"
      className="working-on"
      title="Show the page"
      onClick={() => window.browserApi.assistantChipGo()}
    >
      <span className="wo-label">Working on</span>
      <span className="wo-title truncate">{tab.title || host || 'a page'}</span>
      {host !== '' && <SiteChip host={host} favicon={tab.favicon} />}
      {spaceName !== null && (
        <span className="badge" title={`In the Space ${spaceName}`}>
          {spaceName}
        </span>
      )}
    </button>
  );
}

// ---- The approval card ----------------------------------------------------------------

// The bold parts of a question are the things in quotes (a button, a tab, some text).
function Emphasised({ text }: { text: string }) {
  const pieces = text.split(/"([^"]+)"/);
  return (
    <>
      {pieces.map((piece, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{piece}</strong>
        ) : (
          <span key={i}>{piece}</span>
        ),
      )}
    </>
  );
}

// What the assistant is asking to do, and the ways to answer. Where it happens (the
// site), why it is risky (badges), the exact words or address involved, the tabs in a
// batch or the full text of a skill, what happens next, and Allow / Allow the rest /
// Don't allow. Then Enter allows, Shift+Enter allows the rest, Esc does not allow, and a
// risky one needs Ctrl+Enter. It is drawn in the chat, or popped out over the page (see
// OverlayApp.tsx); the same card either way.
export interface ApprovalView {
  toolName: string;
  ask: string;
  risky: boolean;
  card: CardDetails | null | undefined;
  site: { host: string; favicon: string | null } | null;
}

export function ApprovalCardView({
  view,
  onDecide,
  onStop,
  onMinimize,
  onGoToTab,
  takeKeyboard,
}: {
  view: ApprovalView;
  onDecide: (decision: 'allow' | 'allow-rest' | 'deny') => void;
  // Stop is shown only where nothing else on screen already has one (so, not in the chat,
  // where the message box has it, and not over a page that shows its pill).
  onStop?: () => void;
  // Shrink the card to a strip (popped out over the page only).
  onMinimize?: () => void;
  // Show the tab this step is about (only when it is another tab than the one on screen).
  onGoToTab?: () => void;
  // Ask for the keyboard when it appears (unless you are typing). The popped-out card does
  // not: the app gives it the keyboard itself, since it is in another view.
  takeKeyboard: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const { card, risky, site } = view;
  const badges = badgesFor(view.toolName, risky, card ?? undefined);

  useEffect(() => {
    if (
      takeKeyboard &&
      cardMayTakeFocus(document.activeElement as HTMLElement | null)
    ) {
      ref.current?.focus({ preventScroll: true });
    }
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [takeKeyboard]);

  // With a list or a full text under it, the question is just the first line.
  const lines = view.ask.split('\n');
  const question = card?.list || card?.full ? lines[0] : view.ask;
  const fullLines = card?.full ? card.full.value.split('\n').length : 0;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Approval needed"
      className={risky ? 'approval-card is-risky' : 'approval-card'}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      onKeyDown={(event) => {
        const answer = answerFor(event, risky);
        if (answer === null) return;
        event.preventDefault();
        event.stopPropagation();
        onDecide(answer);
      }}
    >
      <div className="ac-head">
        <StatusIcon state="waiting" />
        <strong>Needs your OK</strong>
        <span className="grow" />
        {site && <SiteChip host={site.host} favicon={site.favicon} />}
        {onGoToTab && (
          <IconButton
            icon="ext-link"
            size="sm"
            label="Go to tab"
            onClick={onGoToTab}
          />
        )}
        {onMinimize && (
          <IconButton
            icon="minus"
            size="sm"
            label="Minimize: work in the page, answer later"
            onClick={onMinimize}
          />
        )}
      </div>
      {badges.length > 0 && (
        <div className="ac-badges">
          {badges.map((badge, i) => (
            <Badge key={badge} tone={risky && i === 0 ? 'warn' : 'neutral'}>
              {badge}
            </Badge>
          ))}
        </div>
      )}
      <div className="ac-body">
        <div className="ac-question">
          <Emphasised text={question} />
        </div>
        {card?.text && (
          <div className="ac-field">
            <span className="ac-label">{card.text.label}</span>
            <code className="ac-mono">{card.text.value}</code>
          </div>
        )}
        {card?.destination && (
          <div className="ac-field">
            <span className="ac-label">Goes to</span>
            <code className="ac-mono">{card.destination}</code>
          </div>
        )}
        {card?.list && (
          <ul className="ac-list">
            {card.list.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
            {card.more ? (
              <li className="muted">…and {card.more} more</li>
            ) : null}
          </ul>
        )}
        {card?.full && (
          <div className="ac-field">
            <span className="ac-label">
              {card.full.label} · {fullLines} line{fullLines === 1 ? '' : 's'}
            </span>
            <pre className="ac-full">{card.full.value}</pre>
          </div>
        )}
        <div className="ac-next">{nextLine(view.toolName)}</div>
      </div>
      <div className="ac-foot">
        <div className="actions">
          <Button
            variant="primary"
            size="sm"
            className={risky ? 'btn-warn-allow' : undefined}
            onClick={() => onDecide('allow')}
            title={risky ? 'Allow (Ctrl+Enter)' : 'Allow (Enter)'}
          >
            Allow
          </Button>
          {!risky && (
            <Button
              size="sm"
              onClick={() => onDecide('allow-rest')}
              title="Go ahead with the rest of this reply without asking again, except for risky actions (Shift+Enter)"
            >
              Allow the rest of this reply
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onDecide('deny')}
            title="Don't allow (Esc)"
          >
            Don't allow
          </Button>
          {onStop && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onStop}
              title="Stop this reply"
            >
              Stop
            </Button>
          )}
        </div>
        <div className="ac-wait">
          If you do nothing, it waits. Nothing happens until you answer.
          {focused &&
            (risky
              ? ' Ctrl+Enter allows, Esc does not.'
              : ' Enter allows, Shift+Enter allows the rest, Esc does not.')}
        </div>
      </div>
    </div>
  );
}

// The card for a waiting step, in the chat.
export function ApprovalCard({
  part,
  chatId,
  messageId,
  tabs,
}: {
  part: ToolPartView;
  chatId: number;
  messageId: number;
  tabs: TabInfo[];
}) {
  return (
    <ApprovalCardView
      view={{
        toolName: part.name,
        ask: part.ask,
        risky: part.risky,
        card: part.card,
        site: stepSite(part, tabs),
      }}
      onDecide={(decision) =>
        window.browserApi.chatDecide(chatId, messageId, part.id, decision)
      }
      takeKeyboard
    />
  );
}

// In the chat, a waiting step whose card has popped out over the page: just a line saying so.
export function PoppedOutNote({ ask }: { ask: string }) {
  return (
    <div className="step" data-state="waiting">
      <div className="step-main" style={{ cursor: 'default' }}>
        <StatusIcon state="waiting" />
        <span className="step-text">
          <span className="step-line truncate">
            <Emphasised text={ask.split('\n')[0]} />
          </span>
          <span className="step-result">
            Waiting for you: answer on the page.
          </span>
        </span>
      </div>
    </div>
  );
}
