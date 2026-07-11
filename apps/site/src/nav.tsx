// The shared shell nav (Studio redesign, round 3 — "Shell nav" mockup screen).
// One nav, everywhere: brand mark + Home/Decisions/C4 Model pills + GitHub +
// a page's own extras (npm, Live demo) + the site-wide Dark/Light toggle. The
// active pill now tracks the current route directly (via `useRoute`) instead
// of a per-page `current` prop — the brand crumb concept it replaced is gone,
// so there's exactly one source of truth for "which module am I on". Each
// page still supplies its own GitHub target (Decisions' source currently
// lives at a different repo than the Studio monorepo's) and its own extras —
// this component only fixes the STRUCTURE drifting, not each link's
// destination.
import type { ReactElement, ReactNode } from 'react';
import { Link, useRoute } from './router.js';
import type { Route } from './router.js';
import { ThemeToggle } from './theme-toggle.js';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly routes: readonly Route[];
}

// Studio redesign, round 3 (S3) — the module pills also need to light on a
// module's own demo route (`/decisions/demo`, `/c4/demo`), not just its pitch
// page, so each item now matches a SET of routes rather than exactly one.
// Home deliberately matches only 'studio-home' — it must stay unlit on every
// demo route, same as it does on the pitch pages.
const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', href: '/', routes: ['studio-home'] },
  { label: 'Decisions', href: '/decisions', routes: ['decisions', 'decisions-demo'] },
  { label: 'C4 Model', href: '/c4', routes: ['c4', 'c4-demo'] },
];

export function SiteNav(props: { repoUrl: string; extras?: ReactNode }): ReactElement {
  const { repoUrl, extras } = props;
  const route = useRoute();
  return (
    <header className="nav-bar">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-word">workspec</span>
          <span className="brand-sub">/ studio</span>
        </Link>
        <nav className="nav-links">
          {NAV_ITEMS.map((item) => {
            const active = item.routes.includes(route);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'nav-pill nav-pill-active' : 'nav-pill'}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className="nav-spacer" />
        <a className="nav-github" href={repoUrl}>
          GitHub ↗
        </a>
        {extras}
        <ThemeToggle />
      </div>
    </header>
  );
}
