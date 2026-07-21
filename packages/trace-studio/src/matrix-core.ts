// The `matrix` domain core — shared by the CLI's `matrix` command
// (`cli.ts`'s `runMatrix`, which resolves `--out`/`--format`/`--dir` and
// either prints or writes the rendered artifact) and the `trace_matrix` MCP
// tool (`mcp-tools/matrix-tool.ts`, which always returns the rendered
// artifact directly — an MCP client has no local file for `--out` to point
// at). This module owns loading the tree + runs, deriving the model,
// projecting it to RTM rows, and rendering the chosen format. Neither
// surface re-implements any of it.

import { buildModel } from '@workspec/trace-model';
import { renderMatrix } from './matrix-render.js';
import { buildMatrixRows } from './matrix-rows.js';
import type { MatrixFormat } from './matrix-format.js';
import type { MatrixRow } from './matrix-row.types.js';
import type { LoadIssue, TraceRepositoryPort } from './repository.js';

/** Inputs a caller has already extracted from its own arg surface (CLI flags or MCP tool args). */
export interface MatrixParams {
  readonly format: MatrixFormat;
  /** Where runs are read from (repo-relative, e.g. `.workspec/.runs`). */
  readonly runsDir: string;
}

/** The rendered RTM plus every problem the loader hit reading `.workspec/`/the runs dir. */
export interface MatrixResult {
  readonly content: string;
  readonly rows: readonly MatrixRow[];
  readonly loadIssues: readonly LoadIssue[];
}

/**
 * Runs `matrix`: loads the tree + runs, derives the model, projects it to
 * the RTM (spec §5/§6), and renders `params.format`. Pure orchestration — no
 * IO beyond the repository reads; the caller decides what to do with
 * `result.content` (print it, write it to `--out`, or return it as an MCP
 * tool's text result).
 */
export async function runMatrixCore(
  params: MatrixParams,
  repository: TraceRepositoryPort,
): Promise<MatrixResult> {
  const { tree, issues } = await repository.loadTree();
  const { runs, issues: runIssues } = await repository.loadRuns(params.runsDir);
  const loadIssues: LoadIssue[] = [...issues, ...runIssues];

  const model = buildModel(tree, runs);
  const rows = buildMatrixRows(model);
  const content = renderMatrix(params.format, rows);

  return { content, rows, loadIssues };
}
