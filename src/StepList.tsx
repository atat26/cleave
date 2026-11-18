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
  RUN_WORDS,
  STATE_WORDS,
  stepSite,
  stepView,
} from './runModel';
import type { RunView, StepState, StepView, ToolPartView } from './runModel';
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
        </span>
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

// One line above the message box: its state in a word, what it is doing, a tick for
// each step so far, and Stop while it works. When it has finished, stopped or got
// stuck it stays until you dismiss it (the x, or Esc) or send your next message.
export function RunBar({
  run,
  chatId,
  onDismiss,
}: {
  run: RunView;
  chatId: number;
  onDismiss: () => void;
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
      {active ? (
        <Button
          size="sm"
          icon="stop"
          title="Stop this reply"
          onClick={() => window.browserApi.chatStop(chatId)}
        >
          Stop
        </Button>
      ) : (
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
// Don't allow. It takes the keyboard only if you are not typing; then Enter allows,
// Shift+Enter allows the rest, Esc does not allow, and a risky one needs Ctrl+Enter.
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
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const card = part.card;
  const site = stepSite(part, tabs);
  const badges = badgesFor(part.name, part.risky, card);
  const decide = (decision: 'allow' | 'allow-rest' | 'deny') =>
    window.browserApi.chatDecide(chatId, messageId, part.id, decision);

  // A new card asks for the keyboard, unless you are in the middle of typing.
  useEffect(() => {
    if (cardMayTakeFocus(document.activeElement as HTMLElement | null)) {
      ref.current?.focus({ preventScroll: true });
    }
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  // With a list or a full text under it, the question is just the first line.
  const lines = part.ask.split('\n');
  const question = card?.list || card?.full ? lines[0] : part.ask;
  const fullLines = card?.full ? card.full.value.split('\n').length : 0;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Approval needed"
      className={part.risky ? 'approval-card is-risky' : 'approval-card'}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      onKeyDown={(event) => {
        const answer = answerFor(event, part.risky);
        if (answer === null) return;
        event.preventDefault();
        event.stopPropagation();
        decide(answer);
      }}
    >
      <div className="ac-head">
        <StatusIcon state="waiting" />
        <strong>Needs your OK</strong>
        <span className="grow" />
        {site && <SiteChip host={site.host} favicon={site.favicon} />}
      </div>
      {badges.length > 0 && (
        <div className="ac-badges">
          {badges.map((badge, i) => (
            <Badge
              key={badge}
              tone={part.risky && i === 0 ? 'warn' : 'neutral'}
            >
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
        <div className="ac-next">{nextLine(part.name)}</div>
      </div>
      <div className="ac-foot">
        <div className="actions">
          <Button
            variant="primary"
            size="sm"
            className={part.risky ? 'btn-warn-allow' : undefined}
            onClick={() => decide('allow')}
            title={part.risky ? 'Allow (Ctrl+Enter)' : 'Allow (Enter)'}
          >
            Allow
          </Button>
          {!part.risky && (
            <Button
              size="sm"
              onClick={() => decide('allow-rest')}
              title="Go ahead with the rest of this reply without asking again, except for risky actions (Shift+Enter)"
            >
              Allow the rest of this reply
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => decide('deny')}
            title="Don't allow (Esc)"
          >
            Don't allow
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.browserApi.chatStop(chatId)}
            title="Stop this reply"
          >
            Stop
          </Button>
        </div>
        <div className="ac-wait">
          If you do nothing, it waits. Nothing happens until you answer.
          {focused &&
            (part.risky
              ? ' Ctrl+Enter allows, Esc does not.'
              : ' Enter allows, Shift+Enter allows the rest, Esc does not.')}
        </div>
      </div>
    </div>
  );
}
