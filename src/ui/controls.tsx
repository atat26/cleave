// The shared controls of the design (docs/design/browser-ui.html): thin React
// wrappers that put the design's class names on real HTML elements, so every
// screen gets the same look, focus ring and states. The look itself is in
// components.css and tokens.css.
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const join = (...parts: (string | false | undefined | null)[]) =>
  parts.filter(Boolean).join(' ');

// ---- Button ------------------------------------------------------------------

export type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  // Shows a spinner in place of the icon, and the button cannot be used.
  loading?: boolean;
  // For toggles: drawn as pressed.
  pressed?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  pressed,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={join(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
        loading && 'loading',
        className,
      )}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {icon && !loading && <Icon name={icon} />}
      {children}
    </button>
  );
}

// A button that is only an icon. `label` is required: it is what a screen reader
// says, and what the tooltip shows.
export function IconButton({
  icon,
  label,
  size = 'md',
  pressed,
  large = false,
  className,
  type = 'button',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: IconName;
  label: string;
  size?: 'sm' | 'md';
  pressed?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type={type}
      className={join('btn btn-icon', size === 'sm' && 'btn-sm', className)}
      aria-label={label}
      title={rest.title ?? label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon name={icon} large={large} />
    </button>
  );
}

// ---- Fields ------------------------------------------------------------------

// A label above a control, with optional help text under it.
export function Field({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help && <div className="field-help">{help}</div>}
    </div>
  );
}

export function Input({
  invalid = false,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={join('input', invalid && 'is-error', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={join('textarea', className)} {...rest} />;
}

export function Select({
  small = false,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { small?: boolean }) {
  return (
    <select
      className={join('select', small && 'select-sm', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

// An on/off switch.
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

// ---- Choosing between a few things -----------------------------------------

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  // Show only the icon (the label is still announced).
  iconOnly?: boolean;
}

// Two to four buttons where exactly one is pressed.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.iconOnly ? option.label : undefined}
          title={option.iconOnly ? option.label : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} />}
          {!option.iconOnly && option.label}
        </button>
      ))}
    </div>
  );
}

// Text tabs with an underline on the selected one.
export function TabList<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---- Small labels --------------------------------------------------------------

export type SpaceColorName =
  | 'blue'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'green';

export function Chip({
  icon,
  closed = false,
  onOpen,
  onRemove,
  removeLabel,
  children,
}: {
  icon?: IconName;
  // Closed things are dashed and grey.
  closed?: boolean;
  onOpen?: () => void;
  // When given, a small × is shown that calls it.
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}) {
  return (
    <span className={join('chip', closed && 'is-closed')}>
      {icon && <Icon name={icon} />}
      {onOpen ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm truncate"
          onClick={onOpen}
        >
          {children}
        </button>
      ) : (
        <span className="truncate">{children}</span>
      )}
      {onRemove && (
        <IconButton
          icon="x"
          label={removeLabel ?? 'Remove'}
          size="sm"
          onClick={onRemove}
        />
      )}
    </span>
  );
}

// A Space's name, or an @mention.
export function Pill({
  color = 'blue',
  mention = false,
  icon,
  children,
}: {
  color?: SpaceColorName;
  mention?: boolean;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={join('pill', `sp-${color}`, mention && 'mention')}>
      {icon && <Icon name={icon} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'ai';

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={join('badge', tone !== 'neutral' && tone)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

// The small square with an emoji that stands for a Space.
export function SpaceIcon({
  emoji,
  color = 'blue',
  suggested = false,
}: {
  emoji: string;
  color?: SpaceColorName;
  suggested?: boolean;
}) {
  return (
    <span
      className={join('sicon', `sp-${color}`, suggested && 'suggested')}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

// ---- Containers ------------------------------------------------------------------

export function Card({
  closed = false,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { closed?: boolean }) {
  return (
    <div className={join('card', closed && 'is-closed', className)} {...rest}>
      {children}
    </div>
  );
}

export type BannerTone = 'info' | 'warn' | 'error' | 'ok';

const BANNER_ICON: Record<BannerTone, IconName> = {
  info: 'info',
  warn: 'warn',
  error: 'circle-x',
  ok: 'check',
};

// A message with an icon, and optional buttons under it.
export function Banner({
  tone = 'info',
  actions,
  children,
}: {
  tone?: BannerTone;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={join('banner', tone !== 'info' && tone)}
      role={tone === 'error' || tone === 'warn' ? 'alert' : 'status'}
    >
      <Icon name={BANNER_ICON[tone]} large />
      <div className="grow">
        <div>{children}</div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

// A row in a list: an icon, a label, and buttons that show on hover.
export function ListRow({
  icon,
  active = false,
  onClick,
  trailing,
  children,
}: {
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  // Shown on the right; give it class "hover-only" to show only on hover.
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={join('lrow', active && 'is-active')}
      aria-current={active || undefined}
      onClick={onClick}
    >
      {icon}
      <span className="truncate grow">{children}</span>
      {trailing}
    </div>
  );
}

export function Progress({
  value,
  label,
}: {
  // 0 to 1.
  value: number;
  label: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}
