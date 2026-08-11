// The one filesystem capability `@workspec/c4-model`'s `C4FileSource` port
// deliberately lacks: deletion. The port is read + write-only by design
// (four methods, see its doc comment), and this package must not widen it —
// so the delete needed by element removal lives here, root-confined with
// the same two-layer discipline as every other write path: the router gates
// the ref shape (`isWorkspecPath` on the constructed path), and this module
// re-verifies containment after resolution before touching the disk.

import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { RefEscapesRootError } from '@workspec/c4-model/fs';

/**
 * Root-confined destructive filesystem operations for the served tree.
 * Deliberately tiny: `deleteFile` is the only member because element
 * deletion is the only mutation the `C4FileSource` port cannot express.
 * Everything else (create/update) goes through `source.writeFile`, which
 * already carries `createFsSource`'s own containment check.
 */
export interface TreeIo {
  /**
   * Deletes the file at repo-relative `ref`. Throws
   * `RefEscapesRootError` when the resolved path is not strictly inside
   * the served root (the root itself included — deleting the root is
   * never legitimate), and rejects with the underlying `ENOENT` when the
   * file is already gone (callers check existence first).
   */
  deleteFile(ref: string): Promise<void>;
}

/**
 * Builds a {@link TreeIo} confined to `root`. Mirrors
 * `createFsSource`'s resolve-then-verify containment (see
 * `@workspec/c4-model`'s `path-containment.ts`): the ref is resolved
 * against the root and must land strictly inside it, or the operation is
 * refused with the same `RefEscapesRootError` the file source throws — so
 * `server.ts`'s existing error classification handles it unchanged.
 */
export function createTreeIo(root: string): TreeIo {
  const resolvedRoot = resolve(root);
  return {
    async deleteFile(ref) {
      const target = resolve(resolvedRoot, ref);
      if (!target.startsWith(resolvedRoot + sep)) {
        throw new RefEscapesRootError(ref);
      }
      await rm(target);
    },
  };
}
