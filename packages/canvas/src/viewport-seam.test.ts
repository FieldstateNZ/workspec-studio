import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Issue #117's viewport seam is a NEGATIVE contract: the package must never
// read window dimensions or query the document for its own root — every
// consumer goes through CanvasViewportContext. A source scan is the only
// test that fails when someone quietly reintroduces a window fallback.
//
// Vitest runs with cwd at the package root (import.meta.url is a served
// URL under jsdom, not a file: URL, so it can't locate the sources).
const SRC_DIR = join(process.cwd(), 'src');

const BANNED = [
  /window\.innerWidth/,
  /window\.innerHeight/,
  /document\.querySelector/,
  /getElementById/,
];

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((rel) => /\.(ts|tsx)$/.test(rel))
    .filter((rel) => !/\.test\.(ts|tsx)$/.test(rel))
    .filter((rel) => !rel.startsWith('test-helpers'));
}

describe('viewport seam (source contract)', () => {
  test('no window-dimension or document-query reads anywhere in the package source', () => {
    const files = sourceFiles();
    // Sanity: the scan actually sees the tree.
    expect(files.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const rel of files) {
      const content = readFileSync(join(SRC_DIR, rel), 'utf8');
      for (const pattern of BANNED) {
        if (pattern.test(content)) offenders.push(`${rel}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
