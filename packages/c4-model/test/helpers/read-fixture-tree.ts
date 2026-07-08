import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { MemorySourceSeed } from '../../src/sources/memory-source.js';

async function walk(dir: string, root: string, out: Record<string, string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, root, out);
      } else if (entry.isFile()) {
        const key = relative(root, full).split(sep).join('/');
        out[key] = await readFile(full, 'utf8');
      }
    }),
  );
}

/**
 * Reads an entire fixture directory tree (e.g. c4-schema's
 * `test/fixtures/enterprise-subset/.workspec`) into a {@link MemorySourceSeed}
 * keyed by POSIX path relative to `root` — the same shape `createMemorySource`
 * expects. Used to load a real on-disk fixture tree through `MemorySource`
 * for the FsSource/MemorySource round-trip tests, and to reuse c4-schema's
 * golden fixtures without vendoring copies.
 */
export async function readFixtureTree(root: string): Promise<MemorySourceSeed> {
  const out: Record<string, string> = {};
  await walk(root, root, out);
  return out;
}
