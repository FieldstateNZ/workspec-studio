// The standalone host chrome: a slim topbar (brand + theme toggle) wrapping
// the mounted `TopologyWorkbench`. `TopologyWorkbench` already owns its own
// header (title, env/lens switchers, counts) — this topbar is deliberately
// minimal, complementary chrome only, mirroring `@workspec/cost-studio`'s
// shell but without duplicating anything the workbench body already shows.

import type { ReactNode } from 'react';
import { TopologyWorkbench } from '@workspec/topology-ui';
import type { ThemeName } from '@workspec/topology-ui';

export interface ShellProps {
  theme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
}

const THEME_OPTIONS: ThemeName[] = ['dark', 'light'];

export function Shell(props: ShellProps): ReactNode {
  return (
    <>
      <header className="tsh-topbar">
        <span className="tsh-glyph" aria-hidden="true" />
        <span className="tsh-brand">workspec-topology</span>
        <span className="tsh-slash">/ studio</span>
        <span className="tsh-spacer" />
        <div className="tsh-toggle" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`tsh-toggle-seg${props.theme === option ? ' tsh-toggle-seg--active' : ''}`}
              aria-pressed={props.theme === option}
              onClick={() => props.onSelectTheme(option)}
            >
              {option === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </header>

      <main className="tsh-main">
        <TopologyWorkbench />
      </main>
    </>
  );
}
