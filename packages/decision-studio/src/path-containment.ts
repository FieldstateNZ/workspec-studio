// Pure containment check used by `FsRepository.resolve()` to guarantee that
// every ref — however it is spelled — resolves to a path inside the served
// root.
//
// `path.resolve(root, ref)` alone is not a safe way to anchor a ref to a
// root: when the *second* argument is itself absolute, `resolve` special-cases
// it and returns that argument verbatim, discarding `root` entirely. On
// POSIX that's a leading `/`. On Windows it's also a drive-letter path
// (`C:\evil`, `C:/evil`) or a UNC path (`\\server\share\evil`) — neither of
// which starts with `/` or contains `..`, so a naive guard that only checks
// for those two shapes lets them straight through, and the old
// `isAbsolute(ref) ? ref : resolve(this.root, ref)` trusted exactly that
// shortcut. This module closes that gap by verifying containment *after*
// resolution instead of trusting the ref's shape beforehand.

import * as nodePath from 'node:path';
import type { Ref } from '@workspec/decision-schema';

/** The slice of `node:path` needed to resolve a ref and test containment. */
export type PathImpl = Pick<typeof nodePath, 'resolve' | 'relative' | 'isAbsolute' | 'sep'>;

/**
 * Thrown by {@link resolveWithinRoot} when a ref resolves to a path outside
 * the served root: a POSIX absolute path, a Windows drive-letter or UNC
 * path, or a `..` traversal that climbs above root.
 */
export class RefEscapesRootError extends Error {
  constructor(
    /** The ref that was rejected. */
    readonly ref: Ref,
  ) {
    super(`ref escapes the served root: ${ref}`);
    this.name = 'RefEscapesRootError';
  }
}

/**
 * Resolves `ref` against `root` and throws {@link RefEscapesRootError} unless
 * the result is contained within `root`.
 *
 * Containment is checked *after* resolution: a ref is contained iff
 * `pathImpl.relative(root, resolved)` doesn't climb above root (`..` exactly,
 * or `..` followed by a separator) and isn't itself absolute — the latter
 * catches the case where `root` and the resolved path share no common
 * ancestor at all (e.g. a UNC path resolved against a drive-letter root).
 *
 * `pathImpl` defaults to the host platform's real `node:path`, so production
 * behaviour always matches whatever OS is actually running the process
 * (this is what makes a drive-letter or UNC ref dangerous specifically on a
 * Windows host). Tests can pass `path.win32` to exercise Windows semantics
 * from POSIX CI, where those shapes would otherwise be unreachable.
 *
 * Containment is purely lexical: this does not call `realpath`, so a symlink
 * planted *inside* root that points outside is still followed on read/write.
 * That is out of scope here — it presupposes an attacker who can already write
 * into the served root; this guard defends against ref-shape traversal, not a
 * compromised working tree.
 */
export function resolveWithinRoot(root: string, ref: Ref, pathImpl: PathImpl = nodePath): string {
  const resolved = pathImpl.resolve(root, ref);
  const rel = pathImpl.relative(root, resolved);
  const escapesRoot =
    rel === '..' || rel.startsWith(`..${pathImpl.sep}`) || pathImpl.isAbsolute(rel);
  if (escapesRoot) {
    throw new RefEscapesRootError(ref);
  }
  return resolved;
}
