// The shared full-page demo shell header (Site Review UX pass, finding 06 —
// "the demo shells are unequal"). One route pattern, `/[module]/demo`, with
// one bar: a back-link brand crumb, an optional middle group (Decisions'
// worked-example switcher), and optional module actions (Export ADR/Reset).
// C4's demo route has no examples or actions today, but gets the exact same
// shell as Decisions' instead of the 640px-embedded-in-marketing-copy
// treatment it had before.
import type { ReactElement, ReactNode } from 'react';
import { Link } from './router.js';

export function DemoBar(props: {
  backHref: string;
  /** Visible link text, e.g. "WorkSpec Decision Studio". */
  backText: string;
  /** Full accessible label, e.g. "Back to the WorkSpec Decision Studio page". */
  backAriaLabel: string;
  middle?: ReactNode;
  actions?: ReactNode;
}): ReactElement {
  const { backHref, backText, backAriaLabel, middle, actions } = props;
  return (
    <header className="demo-bar">
      <Link href={backHref} className="demo-home" aria-label={backAriaLabel}>
        ← {backText}
      </Link>
      {middle}
      {actions !== undefined && <div className="demo-actions">{actions}</div>}
    </header>
  );
}
