// The shared repo-relative-path confinement check for anything that must
// stay inside `.workspec/`: this package's file proxy (`server.ts`'s
// `pathParam`, covering `GET /api/files|file|file-exists` and `PUT
// /api/file`) and its MCP tools (`mcp-tools/write-layout-tool.ts`). Factored
// out to its own file so the HTTP and MCP surfaces can never drift on what
// "confined to `.workspec/`" means — the same reason `@workspec/mcp-core`'s
// `isSafeRelativeRef` exists at all (issue #52's containment guard, applied
// uniformly across every studio package's own entry points).

import { WORKSPEC_DIR } from '@workspec/c4-schema';
import { isSafeRelativeRef } from '@workspec/mcp-core';

/**
 * Whether `raw` is both a legitimately-shaped repo-relative ref (per
 * `@workspec/mcp-core`'s `isSafeRelativeRef` — rejects absolute paths, `..`
 * traversal, backslashes, NUL bytes, and Windows drive-letter prefixes) AND
 * confined to the `.workspec/` tree — the only directory this package's
 * file proxy ever legitimately serves. Built on top of `isSafeRelativeRef`
 * for the shape half rather than re-checking those shapes itself, so this
 * package's confinement rule can never drift from the shape check every
 * other `*-studio` package's HTTP/MCP surfaces already share.
 *
 * This is still only a first-line check, same caveat as
 * `isSafeRelativeRef`'s own doc comment: it does not re-verify containment
 * after resolution. `@workspec/c4-model`'s `createFsSource` does no
 * containment check of its own (it trusts the path it's given), so this
 * pre-check IS the full defence for both `server.ts` and the `c4` MCP
 * tools — see their own doc comments for why that's an accepted trade-off
 * here (a single-user localhost host, not a multi-tenant service).
 */
export function isWorkspecPath(raw: string): boolean {
  if (!isSafeRelativeRef(raw)) return false;
  return raw === WORKSPEC_DIR || raw.startsWith(`${WORKSPEC_DIR}/`);
}
