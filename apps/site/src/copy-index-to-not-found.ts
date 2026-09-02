import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Copies `<distDir>/index.html` to the GitHub Pages SPA fallback, canonical
 * Studio entrypoints and compatibility aliases. The concrete index files make
 * direct Cost and Architecture URLs return HTTP 200 rather than a rendered SPA
 * shell with a 404 status.
 *
 * A no-op if `index.html` has not been built yet.
 */
export function copyIndexForGitHubPages(distDir: string): void {
  const index = resolve(distDir, 'index.html');
  if (!existsSync(index)) return;

  for (const target of [
    resolve(distDir, '404.html'),
    resolve(distDir, 'studio/index.html'),
    resolve(distDir, 'studio/design/index.html'),
    resolve(distDir, 'studio/plan/index.html'),
    resolve(distDir, 'studio/compare/index.html'),
    resolve(distDir, 'studio/decision/index.html'),
    resolve(distDir, 'cost/index.html'),
    resolve(distDir, 'cost/demo/index.html'),
    resolve(distDir, 'architecture/index.html'),
    resolve(distDir, 'architecture/demo/index.html'),
    resolve(distDir, 'arhitecture/index.html'),
    resolve(distDir, 'arhitecture/demo/index.html'),
  ]) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(index, target);
  }
}
