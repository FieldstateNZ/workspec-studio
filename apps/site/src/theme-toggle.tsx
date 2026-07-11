// The site's ONLY theme control (Site Review UX pass, finding 04 — "light
// mode ships but is unreachable"). Reads/writes through @workspec/design's
// shared setTheme()/useTheme() (finding 03/05) so every surface — this nav,
// the Decisions/C4 embeds — agrees, and there is exactly one persisted
// preference key.
import type { ReactElement } from 'react';
import { setTheme, useTheme } from '@workspec/design';

export function ThemeToggle(): ReactElement {
  const theme = useTheme();
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
