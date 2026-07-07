// Shared presentational primitives, ported from the prototype's `primitives.jsx`
// but reworked for accessibility: the `Picker` (inline dropdown) is a real
// button that opens a keyboard-operable menu, and score dots are a proper
// keyboard slider. All colours come from `var(--ds-*)`.

import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

/**
 * Per-option accent, mapping option ids to WorkSpec artifact-type tokens so
 * options read as distinct C4-style elements. Unknown ids fall back to accent.
 */
const OPT_ACCENT: Record<string, string> = {
  aks: 'var(--ds-type-feature)',
  appsvc: 'var(--ds-type-persona)',
  ase: 'var(--ds-type-userreq)',
  aca: 'var(--ds-type-scenario)',
};

/** The accent CSS value for an option id. */
export function optAccent(id: string): string {
  return OPT_ACCENT[id] ?? 'var(--ds-accent)';
}

type IconProps = { className?: string; style?: CSSProperties };

const svgBase = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'aria-hidden': true,
  focusable: false,
} as const;

/** Small stroke icons used across the views. */
export const Icon = {
  chevron: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  ),
  plus: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.5" strokeLinecap="round" {...p}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  ),
  check: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  ),
  spark: (p: IconProps): ReactElement => (
    <svg {...svgBase} fill="currentColor" stroke="none" {...p}>
      <path d="M8 1l1.3 3.7L13 6l-3.7 1.3L8 11 6.7 7.3 3 6l3.7-1.3z" />
    </svg>
  ),
  scale: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 2v12M3 5h10M5 5l-2.5 4.5h5L5 5zM11 5l-2.5 4.5h5L11 5z" />
    </svg>
  ),
  doc: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V1.5zM9 1.5V4.5h3" />
      <path d="M6 8h4M6 10.5h4" />
    </svg>
  ),
  x: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.6" strokeLinecap="round" {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  undo: (p: IconProps): ReactElement => (
    <svg {...svgBase} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 3.5L3 6.5l3 3M3 6.5h6.5a3.5 3.5 0 1 1 0 7H6" />
    </svg>
  ),
};

// ── Chip / Flag ────────────────────────────────────────────────────────────────

/** A small inline badge. */
export function Chip(props: { children: ReactNode; style?: CSSProperties }): ReactElement {
  return (
    <span className="ds-chip" style={props.style}>
      {props.children}
    </span>
  );
}

/** A status flag: neutral, warn, accent, or agent-toned. */
export function Flag(props: {
  children: ReactNode;
  tone?: 'warn' | 'accent' | 'agent';
}): ReactElement {
  const cls = props.tone ? `ds-flag ds-flag-${props.tone}` : 'ds-flag';
  return <span className={cls}>{props.children}</span>;
}

// ── Criteria dots ──────────────────────────────────────────────────────────────

/** Read-only 0–max criterion dots. */
export function Dots(props: { value: number; max?: number; accentless?: boolean }): ReactElement {
  const max = props.max ?? 5;
  const cls = props.accentless ? 'ds-dots ds-dots-accentless' : 'ds-dots';
  return (
    <span className={cls} role="img" aria-label={`${props.value} of ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < props.value ? 'ds-d ds-d-on' : 'ds-d'} />
      ))}
    </span>
  );
}

/** Editable score dots — an accessible keyboard slider (arrows / home / end). */
export function ScoreDots(props: {
  value: number;
  max?: number;
  label: string;
  onChange: (value: number) => void;
}): ReactElement {
  const max = props.max ?? 5;
  const clamp = (n: number): number => Math.max(0, Math.min(max, n));
  return (
    <span
      className="ds-scoredots"
      role="slider"
      tabIndex={0}
      aria-label={props.label}
      aria-valuenow={props.value}
      aria-valuemin={0}
      aria-valuemax={max}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          props.onChange(clamp(props.value + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          props.onChange(clamp(props.value - 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          props.onChange(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          props.onChange(max);
        }
      }}
    >
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          className={i < props.value ? 'ds-d ds-d-on' : 'ds-d'}
          aria-label={`Set ${props.label} to ${i + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onChange(i + 1);
          }}
        />
      ))}
    </span>
  );
}

// ── Picker (accessible inline dropdown) ─────────────────────────────────────────

/** An option in a {@link Picker} menu. */
export interface PickerItem {
  value: string;
  label: string;
  meta?: string;
  active?: boolean;
}

/**
 * A pill button that opens a small menu of choices. Keyboard: the trigger is a
 * button (Space/Enter opens); Escape closes; each item is a button. Closes on
 * outside click. Used for SKU / mode / schedule selection in the cost editor.
 */
export function Picker(props: {
  label: string;
  triggerLabel: ReactNode;
  triggerClassName: string;
  triggerTitle?: string;
  items: PickerItem[];
  onSelect: (value: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="ds-minisel" ref={ref}>
      <button
        type="button"
        className={props.triggerClassName}
        title={props.triggerTitle}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {props.triggerLabel}
      </button>
      {open && (
        <div className="ds-menu" role="menu" id={menuId}>
          {props.items.map((it) => (
            <button
              key={it.value}
              type="button"
              role="menuitem"
              className={it.active ? 'ds-menuitem ds-menuitem-active' : 'ds-menuitem'}
              onClick={(e) => {
                e.stopPropagation();
                props.onSelect(it.value);
                setOpen(false);
              }}
            >
              <span>{it.label}</span>
              {it.meta !== undefined && <span className="ds-menuitem-meta">{it.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
