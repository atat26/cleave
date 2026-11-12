// A page that shows every shared control, in both themes. It is not part of the
// app: open it at the address of the UI page with "#kit" on the end (for example
// http://localhost:5173/#kit while "npm start" is running) to check the look.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  Input,
  Kbd,
  ListRow,
  Pill,
  Progress,
  Segmented,
  Select,
  SpaceIcon,
  Switch,
  TabList,
  Textarea,
} from './ui/controls';
import { Icon } from './ui/Icon';
import { ICON_SHAPES } from './ui/iconData';
import type { IconName } from './ui/iconData';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div className="sect-title">{title}</div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {children}
      </div>
    </section>
  );
}

const SWATCHES = [
  'c-frame',
  'c-surface',
  'c-surface-2',
  'c-surface-3',
  'c-border',
  'c-border-strong',
  'c-text',
  'c-text-2',
  'c-text-3',
  'c-accent',
  'c-accent-tint',
  'c-danger',
  'c-danger-tint',
  'c-warn',
  'c-warn-tint',
  'c-ok',
  'c-ok-tint',
  'sp-blue',
  'sp-teal',
  'sp-amber',
  'sp-rose',
  'sp-violet',
  'sp-green',
];

export function KitPage() {
  const [dark, setDark] = useState(false);
  const [on, setOn] = useState(true);
  const [view, setView] = useState<'page' | 'both' | 'chat'>('both');
  const [tab, setTab] = useState<'history' | 'downloads' | 'uploads'>(
    'history',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.body.style.background = 'var(--c-frame)';
    document.body.style.overflow = 'auto';
  }, [dark]);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 960,
        margin: '0 auto',
        color: 'var(--c-text)',
        fontFamily: 'var(--font)',
        fontSize: 'var(--fs-md)',
        lineHeight: 'var(--lh-body)',
        boxSizing: 'border-box',
      }}
    >
      <div className="row-flex" style={{ marginBottom: 24 }}>
        <h1 className="grow" style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>
          Shared controls
        </h1>
        <Segmented
          label="Theme"
          value={dark ? 'dark' : 'light'}
          onChange={(v) => setDark(v === 'dark')}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>

      <Section title="Buttons">
        <Button>Secondary</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button icon="plus">With icon</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" loading>
          Loading
        </Button>
        <Button pressed icon="pin">
          Pressed
        </Button>
        <IconButton icon="settings" label="Settings" />
        <IconButton icon="more" label="More" size="sm" />
      </Section>

      <Section title="Fields">
        <div style={{ width: 260 }}>
          <Field label="Name" help="Shown in the sidebar.">
            <Input placeholder="Type here" />
          </Field>
        </div>
        <div style={{ width: 260 }}>
          <Field label="With an error" help="That is not a valid address.">
            <Input invalid defaultValue="nope" />
          </Field>
        </div>
        <div style={{ width: 200 }}>
          <Field label="Choose">
            <Select defaultValue="b">
              <option value="a">Markdown</option>
              <option value="b">Plain text</option>
            </Select>
          </Field>
        </div>
        <div style={{ width: 300 }}>
          <Field label="Longer text">
            <Textarea rows={3} defaultValue="A text area." />
          </Field>
        </div>
        <Switch checked={on} onChange={setOn} label="A switch" />
      </Section>

      <Section title="Choosing">
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'page', label: 'Page', icon: 'page', iconOnly: true },
            {
              value: 'both',
              label: 'Page and chat',
              icon: 'split',
              iconOnly: true,
            },
            { value: 'chat', label: 'Chat', icon: 'chat', iconOnly: true },
          ]}
        />
        <div style={{ width: 360 }}>
          <TabList
            label="Library"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'history', label: 'History' },
              { value: 'downloads', label: 'Downloads' },
              { value: 'uploads', label: 'Uploads' },
            ]}
          />
        </div>
      </Section>

      <Section title="Chips, pills, badges">
        <Chip icon="doc" onOpen={() => undefined} onRemove={() => undefined}>
          Meeting notes
        </Chip>
        <Chip
          icon="globe"
          closed
          onOpen={() => undefined}
          onRemove={() => undefined}
        >
          Closed page
        </Chip>
        <Pill color="teal" icon="layers">
          Route planning
        </Pill>
        <Pill mention icon="globe">
          @Fleet calendar
        </Pill>
        <Badge>Neutral</Badge>
        <Badge tone="ok">Open</Badge>
        <Badge tone="warn">Changes a page</Badge>
        <Badge tone="danger">Error</Badge>
        <Badge tone="ai" icon="sparkle">
          Suggested
        </Badge>
        <SpaceIcon emoji="🗺️" color="teal" />
        <SpaceIcon emoji="🧾" color="amber" suggested />
        <Kbd>Ctrl</Kbd>
        <Kbd>T</Kbd>
      </Section>

      <Section title="Rows and cards">
        <div style={{ width: 280 }}>
          <ListRow
            icon={<Icon name="globe" />}
            trailing={
              <IconButton
                icon="x"
                label="Close"
                size="sm"
                className="hover-only"
              />
            }
          >
            A tab row (hover me)
          </ListRow>
          <ListRow active icon={<Icon name="doc" />}>
            The current row
          </ListRow>
        </div>
        <Card style={{ width: 240 }}>
          <strong>Card</strong>
          <div className="muted">Title, meta and actions go here.</div>
        </Card>
        <Card closed style={{ width: 240 }}>
          <strong>Closed card</strong>
          <div className="muted">Lighter and dashed.</div>
        </Card>
      </Section>

      <Section title="Banners">
        <div style={{ width: '100%', display: 'grid', gap: 8 }}>
          <Banner>A short piece of information.</Banner>
          <Banner
            tone="warn"
            actions={
              <>
                <Button size="sm">Use the assistant&apos;s version</Button>
                <Button size="sm">Keep mine</Button>
              </>
            }
          >
            The assistant changed this artifact while you were typing.
          </Banner>
          <Banner tone="error">Something went wrong.</Banner>
          <Banner tone="ok">Saved.</Banner>
        </div>
      </Section>

      <Section title="Progress">
        <div style={{ width: 280 }}>
          <Progress value={0.62} label="Download" />
        </div>
      </Section>

      <Section title="Menu (the look only; the real one comes with the popup layer)">
        <ul className="menu" role="menu" style={{ width: 240 }}>
          <li role="menuitem" tabIndex={0}>
            <Icon name="plus" />
            <span className="lbl">New tab</span>
            <span className="sc">Ctrl+T</span>
          </li>
          <li role="menuitem" tabIndex={0} className="is-hover">
            <Icon name="copy" />
            <span className="lbl">Copy link</span>
          </li>
          <li role="menuitem" aria-disabled="true">
            <Icon name="history" />
            <span className="lbl">Reopen closed tab</span>
          </li>
          <li className="sep" role="separator" />
          <li role="menuitem" tabIndex={0} className="danger">
            <Icon name="trash" />
            <span className="lbl">Delete</span>
          </li>
        </ul>
      </Section>

      <Section title="Colours">
        {SWATCHES.map((name) => (
          <div key={name} style={{ width: 96 }}>
            <div
              style={{
                height: 36,
                borderRadius: 8,
                background: `var(--${name})`,
                border: '1px solid var(--c-border)',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{name}</div>
          </div>
        ))}
      </Section>

      <Section title={`Icons (${Object.keys(ICON_SHAPES).length})`}>
        {(Object.keys(ICON_SHAPES) as IconName[]).map((name) => (
          <div
            key={name}
            style={{
              width: 80,
              display: 'grid',
              justifyItems: 'center',
              gap: 4,
            }}
          >
            <Icon name={name} large />
            <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>
              {name}
            </span>
          </div>
        ))}
      </Section>
    </div>
  );
}
