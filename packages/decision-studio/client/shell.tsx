// The standalone host chrome: a top bar, persistent decision sidebar, and theme
// toggle wrapping the mounted DecisionWorkspace. It lives INSIDE the provider,
// so it reads the decision list through the same repository port (`useDecisions`)
// the views use. Theme is lifted to `main.tsx`, which owns the `theme` prop the
// provider applies as `data-theme`.

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useDecisions } from '@workspec/decision-ui';
import type { ThemeName } from '@workspec/decision-ui';

export interface ShellProps {
  theme: ThemeName;
  onToggleTheme: () => void;
  selectedRef: string | undefined;
  onSelectRef: (ref: string) => void;
  children: ReactNode;
}

export function Shell(props: ShellProps): ReactNode {
  const decisions = useDecisions();
  const list = decisions.data ?? [];

  // Auto-select the first decision once the list loads, or if the selected
  // record disappears after a repository refresh.
  useEffect(() => {
    const first = list[0];
    const selectedExists = list.some((decision) => decision.ref === props.selectedRef);
    if (!selectedExists && first !== undefined) {
      props.onSelectRef(first.ref);
    }
  }, [list, props.onSelectRef, props.selectedRef]);

  return (
    <div className="dsh-shell">
      <header className="dsh-topbar">
        <span className="dsh-brand">
          <svg className="dsh-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path
              d="M 10 32 L 54 32"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="square"
            />
            <circle cx="10" cy="32" r="4.5" stroke="currentColor" strokeWidth="2.6" />
            <rect
              x="25.5"
              y="25.5"
              width="13"
              height="13"
              stroke="currentColor"
              strokeWidth="2.6"
            />
            <circle className="dsh-mark-accent" cx="54" cy="32" r="4.5" />
          </svg>
          <span className="dsh-wmk">WorkSpec</span>
        </span>

        <span className="dsh-spacer" />

        <button
          type="button"
          className="dsh-iconbtn"
          aria-label={`Switch to ${props.theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={props.onToggleTheme}
        >
          {props.theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <div className="dsh-body">
        <aside className="dsh-sidebar">
          <div className="dsh-sidebar-head">
            <h2>Decisions</h2>
            <span aria-label={`${list.length} decisions`}>{list.length}</span>
          </div>

          {decisions.isPending ? (
            <p className="dsh-sidebar-state">Loading decisions…</p>
          ) : decisions.isError ? (
            <p className="dsh-sidebar-state dsh-sidebar-error">
              Could not reach the host API: {decisions.error.message}
            </p>
          ) : list.length === 0 ? (
            <p className="dsh-sidebar-state">No decisions found.</p>
          ) : (
            <nav className="dsh-decision-list" aria-label="Decisions">
              {list.map((decision) => {
                const selected = decision.ref === props.selectedRef;
                return (
                  <button
                    key={decision.ref}
                    type="button"
                    className={selected ? 'dsh-decision dsh-decision-selected' : 'dsh-decision'}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => props.onSelectRef(decision.ref)}
                  >
                    <span className="dsh-decision-title">{decision.title}</span>
                    <span className="dsh-decision-slug">{decision.slug ?? decision.ref}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        <main className="dsh-main">{!decisions.isError && props.children}</main>
      </div>
    </div>
  );
}
