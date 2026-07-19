// Pure Gherkin rendering — the EMIT side of the cucumber emitter.
//
// Turns one `SysReqInput` into the text of one `.feature` file, deterministically
// (stable ordering, stable formatting) so the output is snapshot-testable and
// CI-diffable. No IO, no clock. See docs/traceability/spec.md §3/§4.4.

import type { SysReqInput } from './types.js';

/** 2 spaces per Gherkin nesting level. */
const SCENARIO_INDENT = '  ';
const STEP_INDENT = '    ';
const TABLE_INDENT = '      ';

/** An examples-table cell value: whatever the SystemRequirement schema permits in a row. */
type ExampleValue = string | number | boolean;

/**
 * Strip a redundant leading conjunction (`"and "` / `"but "`, case-insensitive)
 * from a CONTINUATION step's text, so a `given`/`when`/`then` array whose later
 * items already read "and types a name…" (spec §4.4) renders as `And types a
 * name…` rather than `And and types a name…`. Only whole leading conjunction
 * words followed by whitespace are stripped; an internal "and" is untouched.
 * If stripping would leave the step empty, the original is kept.
 */
export function stripLeadingConjunction(text: string): string {
  const match = /^(?:and|but)\s+/i.exec(text);
  if (!match) return text;
  const stripped = text.slice(match[0].length);
  return stripped.length > 0 ? stripped : text;
}

/**
 * Render one Gherkin step block: the FIRST step takes the block keyword
 * (`Given`/`When`/`Then`), every subsequent step becomes `And <continuation>`
 * (with its redundant leading conjunction stripped). Returns `[]` for an empty
 * or absent block, so `given`/`when` (both optional) simply contribute no lines.
 */
function renderStepBlock(keyword: 'Given' | 'When' | 'Then', steps: readonly string[]): string[] {
  return steps.map((step, index) =>
    index === 0
      ? `${STEP_INDENT}${keyword} ${step}`
      : `${STEP_INDENT}And ${stripLeadingConjunction(step)}`,
  );
}

/** The distinct example columns, in first-seen order across rows (deterministic). */
function exampleColumns(rows: readonly Record<string, ExampleValue>[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

/** A row's value for `column`, as a string (missing cells render empty). */
function cellText(row: Record<string, ExampleValue>, column: string): string {
  const value = row[column];
  return value === undefined ? '' : String(value);
}

/**
 * Render the `Examples:` block for a Scenario Outline: a pipe-delimited table
 * with a header row of columns then one row per example. Columns are padded to
 * a stable width (max of header + any cell) so the table is byte-identical for
 * a given input.
 */
function renderExamplesTable(rows: readonly Record<string, ExampleValue>[]): string[] {
  const columns = exampleColumns(rows);
  const width = new Map<string, number>(
    columns.map((column) => [
      column,
      Math.max(column.length, ...rows.map((row) => cellText(row, column).length)),
    ]),
  );

  const renderRow = (cells: readonly string[]): string =>
    `${TABLE_INDENT}| ${columns
      .map((column, i) => (cells[i] ?? '').padEnd(width.get(column) ?? 0))
      .join(' | ')} |`;

  return [
    '',
    `${STEP_INDENT}Examples:`,
    renderRow(columns),
    ...rows.map((row) => renderRow(columns.map((column) => cellText(row, column)))),
  ];
}

/**
 * Render the full text of the `.feature` file for one system-requirement.
 *
 * Shape (spec §3 conventions): a `Feature:` line named for the sysreq's
 * containing feature slug, one blank line, the `@<slug>` tag
 * (`req-tag-on-scenario` — the load-bearing binding), a `Scenario:` (or
 * `Scenario Outline:` when the sysreq has an `examples` table —
 * `outline-from-examples`) named with the sysreq `title`, the given/when/then
 * steps, and — for an outline — the `Examples:` table. Ends with a trailing
 * newline.
 */
export function renderFeatureFile(input: SysReqInput): string {
  const { slug, sysreq } = input;
  const spec = sysreq.spec;
  const hasExamples = spec.examples !== undefined && spec.examples.length > 0;
  const scenarioKeyword = hasExamples ? 'Scenario Outline' : 'Scenario';

  const lines: string[] = [
    `Feature: ${spec.feature}`,
    '',
    `${SCENARIO_INDENT}@${slug}`,
    `${SCENARIO_INDENT}${scenarioKeyword}: ${spec.title}`,
    ...renderStepBlock('Given', spec.given ?? []),
    ...renderStepBlock('When', spec.when ?? []),
    ...renderStepBlock('Then', spec.then),
    ...(hasExamples ? renderExamplesTable(spec.examples ?? []) : []),
  ];

  return `${lines.join('\n')}\n`;
}
