import { ICON_SHAPES } from './iconData';
import type { IconName, Shape } from './iconData';

export type { IconName };

// One icon from the icon set. It is drawn in the surrounding text colour, at 16px
// (or 20px with `large`). Decorative by default; give `label` when the icon is
// the only thing saying what a button does (then it is announced).
export function Icon({
  name,
  large = false,
  label,
  className,
}: {
  name: IconName;
  large?: boolean;
  label?: string;
  className?: string;
}) {
  const shapes: readonly Shape[] = ICON_SHAPES[name];
  const classes = ['i', large ? 'i-lg' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {shapes.map((shape, index) =>
        shape[0] === 'path' ? (
          <path key={index} {...shape[1]} />
        ) : (
          <circle key={index} {...shape[1]} />
        ),
      )}
    </svg>
  );
}
