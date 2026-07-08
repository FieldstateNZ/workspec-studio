import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Copies `<distDir>/index.html` to `<distDir>/404.html`. GitHub Pages serves
 * `404.html` for any path it doesn't recognise as a static file, so this makes
 * client-routed deep links — `/decisions`, `/decisions/demo`, `/c4` — resolve
 * to the SPA shell instead of a real 404. A no-op if `index.html` hasn't been
 * built yet (guards against running before the main build step).
 */
export function copyIndexToNotFound(distDir: string): void {
  const index = resolve(distDir, 'index.html');
  const notFound = resolve(distDir, '404.html');
  if (existsSync(index)) {
    copyFileSync(index, notFound);
  }
}
