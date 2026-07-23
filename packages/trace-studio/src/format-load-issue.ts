// A single, shared rendering of one `LoadIssue` — used by the CLI's
// `warnLoadIssues` (prefixes it onto an `io.err` line) and by the `emit`/
// `matrix` MCP tools (which fold it into a `warnings: string[]` field, since
// an MCP tool result has no separate stderr-shaped diagnostics channel the
// way the CLI does). Kept in one place so the two renderings can't drift.

import type { LoadIssue } from './repository.js';

/** Render one `LoadIssue` as `"<file[:line]>: <message>"` — no severity/prefix, just the location + problem. */
export function formatLoadIssue(issue: LoadIssue): string {
  const at = issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
  return `${at}: ${issue.message}`;
}
