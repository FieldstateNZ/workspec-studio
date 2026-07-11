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
  readonly route: Route;
}

// The three pitch pages SiteNav mounts on (round 3 scope) each resolve to
// exactly one of these routes, so a plain equality check is enough — no
// need to treat a module's own demo route as "still active" here.
const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', href: '/', route: 'studio-home' },
  { label: 'Decisions', href: '/decisions', route: 'decisions' },
  { label: 'C4 Model', href: '/c4', route: 'c4' },
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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={route === item.route ? 'nav-pill nav-pill-active' : 'nav-pill'}
              aria-current={route === item.route ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
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
