import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { copyIndexToNotFound } from './copy-index-to-not-found.js';

describe('copyIndexToNotFound — the GitHub Pages SPA fallback', () => {
  it('duplicates index.html as 404.html so deep links resolve on Pages', () => {
    const dist = mkdtempSync(join(tmpdir(), 'site-dist-'));
    const shell = '<html><body><div id="root"></div></body></html>';
    writeFileSync(join(dist, 'index.html'), shell);

    copyIndexToNotFound(dist);

    expect(readFileSync(join(dist, '404.html'), 'utf8')).toBe(shell);
  });

  it('is a no-op when index.html has not been built yet', () => {
    const dist = mkdtempSync(join(tmpdir(), 'site-dist-empty-'));

    copyIndexToNotFound(dist);

    expect(existsSync(join(dist, '404.html'))).toBe(false);
  });
});
