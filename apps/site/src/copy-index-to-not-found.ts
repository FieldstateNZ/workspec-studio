import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Copies `<distDir>/index.html` to the GitHub Pages SPA fallback and the Cost
 * challenge's real nested entrypoint. `404.html` keeps every client-routed
 * deep link working; `cost/demo/index.html` makes the submitted challenge URL
 * return HTTP 200 rather than a rendered SPA shell with a 404 status.
 *
 * A no-op if `index.html` has not been built yet.
 */
export function copyIndexForGitHubPages(distDir: string): void {
  const index = resolve(distDir, 'index.html');
  if (!existsSync(index)) return;

  for (const target of [resolve(distDir, '404.html'), resolve(distDir, 'cost/demo/index.html')]) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(index, target);
  }
}
