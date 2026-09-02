// The site's ONLY theme control (Site Review UX pass, finding 04 — "light
// mode ships but is unreachable"). Reads/writes through @workspec/design's
// shared setTheme()/useTheme() (finding 03/05) so every surface — this nav,
// the Decisions/C4 embeds — agrees, and there is exactly one persisted
// preference key.
import type { ReactElement } from 'react';
import { setTheme, useTheme } from '@workspec/design';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle(props: { collapsed?: boolean }): ReactElement {
  const theme = useTheme();
  if (props.collapsed) {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    return (
      <button
        type="button"
        className="theme-toggle-collapsed"
        aria-label={`Theme: ${theme}. Switch to ${nextTheme}.`}
        title={`Switch to ${nextTheme} theme`}
        onClick={() => setTheme(nextTheme)}
      >
        {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    );
  }
  return (
    <span className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className={
          theme === 'dark' ? 'theme-toggle-btn theme-toggle-btn-active' : 'theme-toggle-btn'
        }
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
      >
        Dark
      </button>
      <button
        type="button"
        className={
          theme === 'light' ? 'theme-toggle-btn theme-toggle-btn-active' : 'theme-toggle-btn'
        }
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
      >
        Light
      </button>
    </span>
  );
}
