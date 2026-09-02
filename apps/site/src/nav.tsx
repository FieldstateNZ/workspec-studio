// Shared shell for the focused Studio workflows. The canonical WorkSpec
// thread mark comes from the main WorkSpec app; retired modules remain in
// source for now, but are intentionally absent from public navigation.
import type { ReactElement, ReactNode } from 'react';
import { Link } from './router.js';
import { ThemeToggle } from './theme-toggle.js';

export function SiteNav(props: {
  repoUrl: string;
  extras?: ReactNode;
  moduleName?: string;
  moduleHref?: string;
  ariaLabel?: string;
}): ReactElement {
  const {
    repoUrl,
    extras,
    moduleName = 'cost',
    moduleHref = '/cost',
    ariaLabel = 'WorkSpec Cost',
  } = props;
  return (
    <header className="nav-bar">
      <div className="nav-inner">
        <Link href={moduleHref} className="brand" aria-label={ariaLabel}>
          <svg className="brand-symbol" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path d="M 10 32 L 54 32" stroke="currentColor" strokeWidth="2.6" />
            <circle
              cx="10"
              cy="32"
              r="4.5"
              stroke="currentColor"
              strokeWidth="2.6"
              fill="var(--bg)"
            />
            <rect
              x="25.5"
              y="25.5"
              width="13"
              height="13"
              stroke="currentColor"
              strokeWidth="2.6"
              fill="var(--bg)"
            />
            <circle cx="54" cy="32" r="4.5" fill="var(--accent)" />
          </svg>
          <span className="brand-word">
            <span>work</span>
            <strong>spec</strong>
          </span>
          <span className="brand-sub">/ {moduleName}</span>
        </Link>
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
