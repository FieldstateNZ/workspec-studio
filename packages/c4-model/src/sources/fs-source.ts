import {
  mkdir,
  readdir,
  readFile as readFileAsync,
  stat,
  writeFile as writeFileAsync,
} from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { RefEscapesRootError, resolveWithinRoot } from './path-containment.js';

/**
 * `node:fs/promises`-backed {@link C4FileSource}, rooted at `rootDir` — the
 * directory that *contains* `.workspec/` (not `.workspec/` itself), matching
 * every path in this package being POSIX-relative to that root. Node-only:
 * lives behind the package's `./fs` subpath export so the root entry stays
 * free of `node:` imports.
 *
 * Paths are contained: `rootDir` is resolved to an absolute path once, at
 * construction time (mirroring how `@workspec/decision-studio`'s and
 * `@workspec/cost-studio`'s `FsRepository` constructors do `this.root =
 * resolve(root)`), and every relative path passed to `listFiles`/`readFile`/
 * `writeFile`/`exists` is resolved against it through `resolveWithinRoot`
 * (`./path-containment.js`) via the internal `resolveRef` helper. A path
 * that would land outside that root — a POSIX absolute path, `..` traversal,
 * or a Windows drive-letter/UNC path — throws {@link RefEscapesRootError}
 * (re-exported from `../fs.js`) for the three ACTION methods
 * (`listFiles`/`readFile`/`writeFile`), before any filesystem call, so it
 * can't be mistaken for `ENOENT`.
 *
 * `exists` is the one exception: it's a PREDICATE ("does this path name a
 * file in the served tree?"), not an action, and its only caller in this
 * package's own pipeline (`checkDanglingLinks`, on content-derived `~/`
 * link targets that are schema-valid but not shape-restricted — e.g.
 * `~/../escape.md`) must keep working as a best-effort diagnostic rather
 * than aborting the whole model load. So `exists` catches
 * `RefEscapesRootError` and reports `false` — never touching the filesystem
 * for an escaping path — exactly matching `createMemorySource`'s `exists`
 * (`files.has(path)`, which likewise never throws for any string), keeping
 * the two `C4FileSource` implementations at behavioural parity.
 */
export function createFsSource(rootDir: string): C4FileSource {
  const resolvedRoot = resolvePath(rootDir);
  const resolveRef = (relativePath: string): string =>
    resolveWithinRoot(resolvedRoot, relativePath);

  return {
    async listFiles(dirPath) {
      const target = resolveRef(dirPath);
      let entries;
      try {
        entries = await readdir(target, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
      return entries.filter((entry) => entry.isFile()).map((entry) => `${dirPath}/${entry.name}`);
    },
    async readFile(path) {
      return readFileAsync(resolveRef(path), 'utf8');
    },
    async writeFile(path, content) {
      const target = resolveRef(path);
      await mkdir(dirname(target), { recursive: true });
      await writeFileAsync(target, content, 'utf8');
    },
    async exists(path) {
      // A predicate, not an action: an escaping path is reported as
      // "does not exist" rather than thrown — see this function's own doc
      // comment above for why. The `resolveRef` call is its own try/catch,
      // separate from the `stat` below, so an escape is caught and answered
      // `false` WITHOUT ever reaching `stat` (never touches the filesystem
      // for a path outside the root).
      let target: string;
      try {
        target = resolveRef(path);
      } catch (error) {
        if (error instanceof RefEscapesRootError) {
          return false;
        }
        throw error;
      }
      try {
        const info = await stat(target);
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
