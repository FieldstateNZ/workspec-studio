// The standalone host chrome: a top bar with the brand + a theme toggle,
// wrapping the mounted `<C4Explorer>`. Unlike `@workspec/decision-ui` (a
// context provider binds the palette for its whole subtree), `@workspec/c4-ui`
// hands theming to each top-level component directly via `ThemedRoot` — so
// this shell binds the SAME WorkSpec token palette on its own root using
// c4-ui's re-exported `themeStyle`, the identical dual-signal convention
// (`data-aesthetic`/`data-theme` attrs + `.dark` class) `ThemedRoot` uses
// internally for `<C4Explorer>` below it.
import type { CSSProperties, ReactNode } from 'react';
import { themeStyle } from '@workspec/c4-ui';
import type { ThemeName } from '@workspec/c4-ui';

export interface ShellProps {
  theme: ThemeName;
  onToggleTheme: () => void;
  dir: string;
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
        <button
          type="button"
          className="c4sh-iconbtn"
          aria-label={`Switch to ${props.theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={props.onToggleTheme}
        >
          {props.theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="c4sh-main">{props.children}</main>
    </div>
  );
}
