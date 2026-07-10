// The shared marketing-shell nav (Site Review UX pass, finding 07 — "nav
// drift between sibling pages"). One pattern everywhere: brand crumb + every
// module + GitHub, with a page's own extras (npm, Live demo) appended after,
// and the site-wide Dark/Light toggle. Each page still supplies its own
// GitHub target (Decisions' source currently lives at a different repo than
// the Studio monorepo's) and its own extras — this component only fixes the
// STRUCTURE drifting, not each link's destination.
import type { ReactElement, ReactNode } from 'react';
import { Link } from './router.js';
import { ThemeToggle } from './theme-toggle.js';

export interface NavModule {
  readonly label: string;
  readonly href: string;
}

/** Every WorkSpec Studio module, in nav order — shown on every page, including the module's own. */
export const NAV_MODULES: readonly NavModule[] = [
  { label: 'Decisions', href: '/decisions' },
  { label: 'C4 Diagrams', href: '/c4' },
];

export function SiteNav(props: {
  /** The current module's label (must match a `NAV_MODULES` entry), or omit for the Studio home. */
  current?: string;
  repoUrl: string;
  extras?: ReactNode;
}): ReactElement {
  const { current, repoUrl, extras } = props;
  return (
    <header className="nav">
      <span className="brand">
        <Link href="/">WorkSpec Studio</Link>
        {current !== undefined && (
          <>
            {' '}
            · <strong>{current}</strong>
          </>
        )}
      </span>
      <nav className="nav-links">
        {NAV_MODULES.map((mod) => (
          <Link key={mod.href} href={mod.href}>
            {mod.label}
          </Link>
        ))}
        <a href={repoUrl}>GitHub</a>
        {extras}
        <ThemeToggle />
      </nav>
    </header>
  );
}
