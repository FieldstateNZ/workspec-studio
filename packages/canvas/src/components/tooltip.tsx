import type { CSSProperties, FC, ReactNode } from 'react';

/**
 * Dependency-free tooltip + kbd, vendored for the toolbar (#118). The
 * enterprise Toolbar used the app's radix-based tooltip/kbd pair (~61
 * LOC); pulling radix into this package for one hover pill isn't worth the
 * dependency, so this is a CSS-only equivalent: same placement (above,
 * 4px offset), same dark pill with label + keyboard chip, fade/zoom-in on
 * hover or keyboard focus. Deviation logged in the S2 report.
 */

const TIP_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 4px)',
  left: '50%',
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--panel-dark)',
  color: 'var(--on-accent)',
  fontSize: 12,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  opacity: 0,
  transform: 'translateX(-50%) scale(0.95)',
  transformOrigin: 'bottom center',
  transition: 'opacity 120ms ease, transform 120ms ease',
};

/** The keyboard-shortcut chip inside a tooltip. */
export const Kbd: FC<{ children: ReactNode }> = ({ children }) => (
  <kbd
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 20,
      height: 20,
      padding: '0 4px',
      borderRadius: 4,
      background: 'color-mix(in oklab, var(--bg) 20%, transparent)',
      color: 'inherit',
      fontFamily: 'var(--sans)',
      fontSize: 11,
      fontWeight: 500,
      pointerEvents: 'none',
      userSelect: 'none',
    }}
  >
    {children}
  </kbd>
);

/**
 * Wrap a trigger with a hover/focus tooltip. `label` + optional `shortcut`
 * render in the pill; the wrapper is display:inline-flex so it doesn't
 * disturb toolbar layout.
 */
export const Tooltip: FC<{ label: string; shortcut?: string; children: ReactNode }> = ({
  label,
  shortcut,
  children,
}) => (
  <span className="wsc-tooltip-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
    {children}
    <span role="tooltip" className="wsc-tooltip" style={TIP_STYLE}>
      <span>{label}</span>
      {shortcut !== undefined && <Kbd>{shortcut}</Kbd>}
    </span>
  </span>
);
