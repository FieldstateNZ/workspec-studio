// The on-canvas C4 breadcrumb (A1 owner ruling, round 2): a structural
// reproduction of enterprise HEAD's `C4Toolbar.tsx:158-201`, not an
// interpretation of it.
//
// Matched from workspec@d4a4c1d3 (read-only), point by point:
//   - `C4Toolbar.tsx:159`  the group floats top-left over the canvas
//     (`absolute top-2 left-2`), carrying `data-canvas-ui`.
//   - `C4Toolbar.tsx:76-77` `GROUP_CHROME` — 36px tall, rounded, bordered,
//     `bg-background/95` + backdrop blur + shadow. `.c4sh-crumb-group`
//     below is that recipe in WorkSpec tokens.
//   - `C4Toolbar.tsx:163-183` one `<button type="button">` per stack frame;
//     a `ChevronRight` separator for every frame after the first; the LAST
//     frame is `disabled` and takes the foreground colour while ancestors
//     are muted with a hover state; the label is the frame title inside a
//     truncating span; `title` is `${LEVEL_LABEL[level]} — ${title}`.
//   - `C4Toolbar.tsx:30-36` `LEVEL_LABEL`, verbatim.
//
// DELIBERATELY NOT ADDED: enterprise's crumb carries no `aria-*` at all —
// no `aria-current`, no nav landmark, no listbox/menu roles, and no
// keyboard handling beyond what native `<button>` gives it. The owner's
// ruling is to match, not to improve, so this carries none either. Native
// button semantics (focusable, Enter/Space activate, `disabled` exposed)
// are inherent to the element, not an addition.
//
// The crumb does NOT switch diagrams. In enterprise, view switching belongs
// to the global left nav, never the canvas chrome
// (`ProjectGraphCanvas.tsx:908-911` says so explicitly); the crumb only
// walks BACK UP a drill stack. The studio has no drill stack yet, so today
// this renders a single disabled label for the current diagram — which is
// exactly what enterprise renders at stack depth 1. It becomes a real trail
// when A3 lands `drillDown`.

import type { ReactElement } from 'react';

/** One frame of the drill stack — enterprise's `C4Frame` (`useC4Diagram.ts:68-72`). */
export interface DiagramCrumbFrame {
  readonly slug: string;
  readonly title: string;
  /** The diagram's `type` field, mapped to a level word for the tooltip. */
  readonly type: string;
}

export interface DiagramCrumbProps {
  /**
   * The drill stack, shallowest first. The LAST frame is the diagram on
   * screen and is rendered disabled. An empty stack renders nothing.
   */
  readonly stack: readonly DiagramCrumbFrame[];
  /** Enterprise's `onCrumb` — walk back up to the frame at `index`. Never fires for the last frame. */
  readonly onCrumb: (index: number) => void;
}

/** Enterprise's `LEVEL_LABEL` (C4Toolbar.tsx:30-36), verbatim — anything outside the C4 four is "Diagram". */
const LEVEL_LABEL: Readonly<Record<string, string>> = {
  'c4-context': 'Context',
  'c4-container': 'Container',
  'c4-component': 'Component',
  'c4-code': 'Code',
};

/** The level word for a diagram type — never invents a level for a non-C4 type. */
function levelLabel(type: string): string {
  return LEVEL_LABEL[type] ?? 'Diagram';
}

/** Enterprise's lucide `ChevronRight` separator (`C4Toolbar.tsx:166`), as an inline path so the shell takes no icon dependency. */
function ChevronRight(): ReactElement {
  return (
    <svg
      className="c4sh-crumb-sep"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function DiagramCrumb(props: DiagramCrumbProps): ReactElement | null {
  const { stack, onCrumb } = props;
  if (stack.length === 0) return null;

  return (
    <div className="c4sh-crumb" data-canvas-ui>
      <div className="c4sh-crumb-group">
        {stack.map((frame, index) => {
          const isLast = index === stack.length - 1;
          return (
            <span className="c4sh-crumb-frame" key={frame.slug}>
              {index > 0 && <ChevronRight />}
              <button
                type="button"
                disabled={isLast}
                title={`${levelLabel(frame.type)} — ${frame.title}`}
                className={isLast ? 'c4sh-crumb-btn c4sh-crumb-btn-current' : 'c4sh-crumb-btn'}
                onClick={() => {
                  onCrumb(index);
                }}
              >
                <span className="c4sh-crumb-label">{frame.title}</span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
