// The standalone host chrome (A1, #131 — owner-review rounds 1 and 2): a
// slim top bar over a FULL-BLEED canvas area.
//
// ROUND 1 removed the diagrams sidebar, its list panel, and its collapse
// control: the owner's ruling was that a persistent "Diagrams" panel
// conflates a browsing surface with the C4 architecture page. Enterprise
// HEAD agrees — `ArchitectureCanvasView.tsx:484-580` renders the canvas
// stage and floating chrome ONLY, and no diagram-list panel exists anywhere
// in that app.
//
// ROUND 2 fixed WHERE diagram switching lives, by translating enterprise's
// own separation of concerns faithfully:
//   - The CANVAS carries a breadcrumb only ({@link DiagramCrumb}) — in
//     enterprise the crumb walks back up a drill stack and never switches
//     views. `ProjectGraphCanvas.tsx:908-911` states outright that on the
//     architecture view "the left nav owns view switching and the C4
//     pipeline has no saved-view/type-filter affordances".
//   - SWITCHING therefore belongs to a NAV. Enterprise's is the global left
//     sidebar (`project-nav-items.tsx:87`). The studio has no global nav
//     shell, and re-introducing a left column is precisely what round 1
//     removed — so its analogue is this top bar, which already carries the
//     app-level controls (brand, working dir, theme). The nav renders as a
//     compact horizontal row of the SAME `deriveLevelTabs` labels the
//     explorer's own header would have used, so nav order and level order
//     can never disagree. It is app chrome, not canvas chrome: it never
//     floats over the diagram and never takes a layout column from it.
//
// THEME TOGGLE PLACEMENT: enterprise has no theme control at the canvas
// level — it lives in the global app shell's sidebar footer
// (`components/layout/AppSidebar.tsx:272`). Same reasoning as the nav: the
// studio's top bar is the app-chrome slot, mirroring where enterprise's own
// header puts its user controls (`project-header.tsx:36`).
//
// Unlike `@workspec/decision-ui` (a context provider binds the palette for
// its whole subtree), `@workspec/c4-ui` hands theming to each top-level
// component directly via `ThemedRoot` — so this shell binds the SAME
// WorkSpec token palette on its own root using c4-ui's re-exported
// `themeStyle`, the identical dual-signal convention
// (`data-aesthetic`/`data-theme` attrs + `.dark` class) `ThemedRoot` uses
// internally for `<C4Explorer>` below it.
import type { CSSProperties, ReactNode } from 'react';
import { themeStyle } from '@workspec/c4-ui';
import type { ThemeName } from '@workspec/c4-ui';
import { DiagramCrumb } from './diagram-crumb.js';
import type { DiagramCrumbFrame } from './diagram-crumb.js';

/** One entry in the top bar's diagram nav. `label` is the `deriveLevelTabs` label ("1 · Context"). */
export interface ShellDiagramItem {
  readonly slug: string;
  readonly label: string;
}

export interface ShellProps {
  theme: ThemeName;
  /** Set the shell (and explorer) theme — the top bar's Light/Dark toggle. */
  onThemeChange: (theme: ThemeName) => void;
  dir: string;
  /** The discovered diagrams, in the explorer's own order (`deriveLevelTabs` — canonical levels first). */
  diagrams: readonly ShellDiagramItem[];
  /** The currently shown diagram — marks its nav entry current. */
  selectedSlug: string | null;
  /** Called when the user picks a diagram in the top bar's nav. */
  onSelectDiagram: (slug: string) => void;
  /** The on-canvas breadcrumb's drill stack, shallowest first (last = on screen). */
  crumbStack: readonly DiagramCrumbFrame[];
  /** Walk the breadcrumb back up to the frame at `index`. */
  onCrumb: (index: number) => void;
  /**
   * A failed server write's message (A2's `onWriteError`). Shown as a
   * dismissible banner over the canvas — the same "the write did not land,
   * your local edit is now ahead of the files" signal `C4Diagram` already
   * gives for layout writes.
   */
  writeError?: string | null;
  /** Dismisses {@link ShellProps.writeError}. */
  onDismissWriteError?: () => void;
  children: ReactNode;
}

export function Shell(props: ShellProps): ReactNode {
  const classes = ['c4sh-shell'];
  if (props.theme === 'dark') classes.push('dark');

  return (
    <div
      className={classes.join(' ')}
      data-aesthetic="console"
      data-theme={props.theme}
      style={themeStyle(props.theme) as CSSProperties}
    >
      <header className="c4sh-topbar">
        <span className="c4sh-brand">
          <span className="c4sh-glyph">C4</span>
          <span className="c4sh-wmk">
            C4 Studio <span>· WorkSpec</span>
          </span>
        </span>
        <span className="c4sh-dir" title={props.dir}>
          {props.dir}
        </span>
        <span className="c4sh-spacer" />

        {props.diagrams.length > 0 && (
          <nav className="c4sh-nav" aria-label="Diagrams">
            {props.diagrams.map((diagram) => (
              <button
                key={diagram.slug}
                type="button"
                className={
                  diagram.slug === props.selectedSlug
                    ? 'c4sh-nav-btn c4sh-nav-btn-current'
                    : 'c4sh-nav-btn'
                }
                aria-current={diagram.slug === props.selectedSlug ? 'page' : undefined}
                onClick={() => props.onSelectDiagram(diagram.slug)}
              >
                {diagram.label}
              </button>
            ))}
          </nav>
        )}

        <div className="c4sh-theme-toggle" role="group" aria-label="Theme">
          <button
            type="button"
            className="c4sh-theme-btn"
            aria-pressed={props.theme === 'light'}
            onClick={() => props.onThemeChange('light')}
          >
            Light
          </button>
          <button
            type="button"
            className="c4sh-theme-btn"
            aria-pressed={props.theme === 'dark'}
            onClick={() => props.onThemeChange('dark')}
          >
            Dark
          </button>
        </div>
      </header>

      <main className="c4sh-main">
        {props.children}
        {/* Floating canvas chrome — never a layout column. */}
        <DiagramCrumb stack={props.crumbStack} onCrumb={props.onCrumb} />
        {props.writeError !== null && props.writeError !== undefined && (
          <div className="c4sh-write-error" role="alert">
            <span className="c4sh-write-error-text">{props.writeError}</span>
            <button
              type="button"
              className="c4sh-write-error-close"
              aria-label="Dismiss write error"
              onClick={props.onDismissWriteError}
            >
              ×
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
