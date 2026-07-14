// The shared workbench bar (Studio redesign, round 3 — "workbench bar
// (shared demo shell)" mockup screen, lines 186-200). Refactored from the old
// DemoBar: that component's back-link brand crumb is gone now that both demo
// pages render the shared SiteNav (brand + Home/Decisions/C4 Model pills)
// above this bar — the module signal lives there. What's left is pure
// module-workbench chrome: segmented Decisions/C4 Model tabs that NAVIGATE
// between `/decisions/demo` and `/c4/demo` (they're routes, not tabpanels —
// hence `Link`s with `aria-current`, mirroring SiteNav's own pattern), a mono
// crumb naming what's loaded, and each module's own actions. C4's demo route
// has no actions today, so that slot is simply omitted.
import type { ReactElement, ReactNode } from 'react';
import { Link, useRoute } from './router.js';
import type { Route } from './router.js';

interface ModuleTab {
  readonly label: string;
  readonly href: string;
  readonly route: Route;
}

const MODULE_TABS: readonly ModuleTab[] = [
  { label: 'Decisions', href: '/decisions/demo', route: 'decisions-demo' },
  { label: 'C4 Model', href: '/c4/demo', route: 'c4-demo' },
  { label: 'Cost', href: '/cost/demo', route: 'cost-demo' },
];

export function WorkbenchBar(props: {
  /** The crumb's value slot, after "example ▸" — a static name (C4) or the
   *  worked-example switcher (Decisions; the switcher's own active-styled
   *  pill IS the "active example" signal, so crumb and switcher merge here). */
  crumb: ReactNode;
  /** Module actions (e.g. Decisions' Export ADR / Reset). Omit to leave the slot empty. */
  actions?: ReactNode;
}): ReactElement {
  const { crumb, actions } = props;
  const route = useRoute();
  return (
    <div className="wb-bar">
      <div className="wb-inner">
        <nav className="wb-tabs" aria-label="Studio">
          {MODULE_TABS.map((tab) => {
            const active = route === tab.route;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={active ? 'wb-tab wb-tab-active' : 'wb-tab'}
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="wb-crumb">
          <span className="wb-crumb-eyebrow">example</span>
          <span className="wb-crumb-sep" aria-hidden="true">
            ▸
          </span>
          {crumb}
        </div>
        <span className="wb-spacer" />
        {actions !== undefined && <div className="wb-actions">{actions}</div>}
      </div>
    </div>
  );
}
