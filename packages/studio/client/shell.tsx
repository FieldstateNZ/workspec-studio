// The standalone host chrome: a top bar with a decision file picker and a theme
// toggle, wrapping the mounted DecisionWorkspace. It lives INSIDE the provider,
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

  // Auto-select the first decision once the list loads.
  useEffect(() => {
    if (props.selectedRef === undefined && list.length > 0) {
      props.onSelectRef(list[0]!.ref);
    }
  }, [list, props]);

  return (
    <div className="dsh-shell">
      <header className="dsh-topbar">
        <span className="dsh-brand">
          <span className="dsh-glyph">DS</span>
          <span className="dsh-wmk">
            Decision Studio <span>· WorkSpec</span>
          </span>
        </span>

        <span className="dsh-spacer" />

        <label className="dsh-picker">
          <span className="dsh-picker-lab">Decision</span>
          <select
            value={props.selectedRef ?? ''}
            onChange={(e) => props.onSelectRef(e.target.value)}
            disabled={list.length === 0}
          >
            {list.length === 0 && <option value="">No decisions found</option>}
            {list.map((d) => (
              <option key={d.ref} value={d.ref}>
                {d.title ?? d.id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="dsh-iconbtn"
          aria-label={`Switch to ${props.theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={props.onToggleTheme}
        >
          {props.theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="dsh-main">
        {decisions.isError ? (
          <div className="dsh-empty">Could not reach the host API: {decisions.error.message}</div>
        ) : (
          props.children
        )}
      </main>
    </div>
  );
}
