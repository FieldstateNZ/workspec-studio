// Pure Gherkin rendering — the EMIT side of the cucumber emitter.
//
// Turns one `RuleWithScenarios` into the text of one `.feature` file,
// deterministically (stable ordering, stable formatting) so the output is
// snapshot-testable and CI-diffable. No IO, no clock. Shape (spec §3
// `feature-file-per-rule` + `rule-groups-scenarios`): `Feature:` › `Rule:` ›
// one `Scenario:`/`Scenario Outline:` per scenario the Rule groups. See
// docs/traceability/spec.md §3/§4.4/§4.5.

import type { Scenario } from '@workspec/req-schema';
import type { RuleWithScenarios, ScenarioInput } from './types.js';

/** Gherkin nesting: Feature (0) › Rule (1) › Scenario (2) › step/table (3/4). */
const RULE_INDENT = '  ';
const SCENARIO_INDENT = '    ';
const STEP_INDENT = '      ';
const TABLE_INDENT = '        ';

/** An examples-table cell value: whatever the Scenario schema permits in a row. */
type ExampleValue = string | number | boolean;

/**
 * Strip a redundant leading conjunction (`"and "` / `"but "`, case-insensitive)
 * from a CONTINUATION step's text, so a `given`/`when`/`then` array whose later
 * items already read "and types a name…" (spec §4.5) renders as `And types a
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
 * Render one scenario's lines: the `@<scenario-slug>` tag (`req-tag-on-scenario`
 * — the load-bearing binding, keyed on the SCENARIO slug), a `Scenario:` (or
 * `Scenario Outline:` when the scenario has an `examples` table —
 * `outline-from-examples`) named with the scenario's `title`, its
 * given/when/then steps, and — for an outline — the `Examples:` table. Does
 * NOT include surrounding blank lines; the caller places those between blocks.
 */
function renderScenarioBlock(input: ScenarioInput): string[] {
  const spec: Scenario['spec'] = input.artifact.spec;
  const hasExamples = spec.examples !== undefined && spec.examples.length > 0;
  const scenarioKeyword = hasExamples ? 'Scenario Outline' : 'Scenario';

  return [
    `${SCENARIO_INDENT}@${input.slug}`,
    `${SCENARIO_INDENT}${scenarioKeyword}: ${spec.title}`,
    ...renderStepBlock('Given', spec.given ?? []),
    ...renderStepBlock('When', spec.when ?? []),
    ...renderStepBlock('Then', spec.then),
    ...(hasExamples ? renderExamplesTable(spec.examples ?? []) : []),
  ];
}

/**
 * Render the full text of the `.feature` file for one Rule (spec §3
 * `feature-file-per-rule`): a `Feature:` line named for the Rule's containing
 * feature slug, one blank line, a `Rule:` line named for the Rule's `title`,
 * then every scenario the Rule groups (`rule-groups-scenarios`), each
 * separated by a blank line. A Rule with no scenarios (an "empty rule", spec
 * §4.7) renders just the `Feature:`/`Rule:` header. Ends with a trailing
 * newline, never two.
 */
export function renderFeatureFile(rule: RuleWithScenarios): string {
  const spec = rule.sysreq.artifact.spec;

  const lines: string[] = [`Feature: ${spec.feature}`, '', `${RULE_INDENT}Rule: ${spec.title}`];

  if (rule.scenarios.length > 0) {
    lines.push(
      '',
      ...rule.scenarios.flatMap((scenario, index) => {
        const block = renderScenarioBlock(scenario);
        return index === 0 ? block : ['', ...block];
      }),
    );
  }

  return `${lines.join('\n')}\n`;
}
