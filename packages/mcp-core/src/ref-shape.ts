// The single ref-shape predicate shared by every `*-studio` package's HTTP
// layer (`server.ts`'s `refFrom`) and its MCP tools (`read-ref-arg.ts`). A ref
// is only ever a repo-root-relative POSIX path by contract; this rejects
// every shape that isn't — a POSIX-absolute path, any `..` traversal, a
// backslash, a NUL byte, or a Windows drive-letter prefix. Factored out here
// (moved from `@workspec/decision-studio` in Stage 2) so every module's REST
// and MCP entry points share one implementation and can never drift from
// each other (issue #52's containment guard, applied uniformly across every
// studio package).
//
// This is a *first-line, shape-only* check, deliberately stricter than
// necessary (it rejects `..` and backslashes even on a POSIX host, where a
// backslash is a legal filename character and `..\..\x` would otherwise be
// one literal filename created inside root on write). It is NOT the
// authoritative containment check: each module's own repository `resolve()`
// (or equivalent) still re-verifies containment after resolution regardless
// of what reaches it.

/** Matches a Windows drive-letter prefix (`C:\`, `C:/`, or bare `C:`). */
const DRIVE_LETTER_PATTERN = /^[A-Za-z]:/;

/**
 * Whether `raw` is a legitimately-shaped repo-root-relative POSIX ref.
 * Returns `false` for the empty string and for any absolute / traversing /
 * backslashed / NUL-bearing / drive-letter-prefixed shape.
 */
export function isSafeRelativeRef(raw: string): boolean {
  if (raw.length === 0) return false;
  if (raw.startsWith('/')) return false;
  if (raw.includes('..')) return false;
  if (raw.includes('\0')) return false;
  if (raw.includes('\\')) return false;
  if (DRIVE_LETTER_PATTERN.test(raw)) return false;
  return true;
}
