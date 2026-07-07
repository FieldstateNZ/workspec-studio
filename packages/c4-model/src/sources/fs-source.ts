import { mkdir, readdir, readFile as readFileAsync, stat, writeFile as writeFileAsync } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { C4FileSource } from '../ports/c4-file-source.js';

/**
 * `node:fs/promises`-backed {@link C4FileSource}, rooted at `rootDir` — the
 * directory that *contains* `.workspec/` (not `.workspec/` itself), matching
 * every path in this package being POSIX-relative to that root. Node-only:
 * lives behind the package's `./fs` subpath export so the root entry stays
 * free of `node:` imports.
 */
export function createFsSource(rootDir: string): C4FileSource {
  const resolve = (relativePath: string): string => join(rootDir, relativePath);

  return {
    async listFiles(dirPath) {
      let entries;
      try {
        entries = await readdir(resolve(dirPath), { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
      return entries.filter((entry) => entry.isFile()).map((entry) => `${dirPath}/${entry.name}`);
    },
    async readFile(path) {
      return readFileAsync(resolve(path), 'utf8');
    },
    async writeFile(path, content) {
      await mkdir(dirname(resolve(path)), { recursive: true });
      await writeFileAsync(resolve(path), content, 'utf8');
    },
    async exists(path) {
      try {
        const info = await stat(resolve(path));
        return info.isFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        throw error;
      }
    },
  };
}
