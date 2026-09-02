import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { copyIndexForGitHubPages } from './copy-index-to-not-found.js';

describe('copyIndexForGitHubPages — fallback plus real Studio entrypoints', () => {
  it('duplicates index.html as the fallback, canonical entrypoints and aliases', () => {
    const dist = mkdtempSync(join(tmpdir(), 'site-dist-'));
    const shell = '<html><body><div id="root"></div></body></html>';
    writeFileSync(join(dist, 'index.html'), shell);

    copyIndexForGitHubPages(dist);

    expect(readFileSync(join(dist, '404.html'), 'utf8')).toBe(shell);
    expect(readFileSync(join(dist, 'cost/index.html'), 'utf8')).toBe(shell);
    expect(readFileSync(join(dist, 'cost/demo/index.html'), 'utf8')).toBe(shell);
    expect(readFileSync(join(dist, 'architecture/index.html'), 'utf8')).toBe(shell);
    expect(readFileSync(join(dist, 'architecture/demo/index.html'), 'utf8')).toBe(shell);
    expect(readFileSync(join(dist, 'arhitecture/index.html'), 'utf8')).toBe(shell);
    expect(readFileSync(join(dist, 'arhitecture/demo/index.html'), 'utf8')).toBe(shell);
  });

  it('is a no-op when index.html has not been built yet', () => {
    const dist = mkdtempSync(join(tmpdir(), 'site-dist-empty-'));

    copyIndexForGitHubPages(dist);

    expect(existsSync(join(dist, '404.html'))).toBe(false);
    expect(existsSync(join(dist, 'cost/index.html'))).toBe(false);
    expect(existsSync(join(dist, 'cost/demo/index.html'))).toBe(false);
    expect(existsSync(join(dist, 'architecture/index.html'))).toBe(false);
    expect(existsSync(join(dist, 'architecture/demo/index.html'))).toBe(false);
    expect(existsSync(join(dist, 'arhitecture/index.html'))).toBe(false);
    expect(existsSync(join(dist, 'arhitecture/demo/index.html'))).toBe(false);
  });
});
