// The `cucumber` emitter — emit (Rules+scenarios → .feature files) + ingest
// (Cucumber JSON report → TestRun), plus a mock runner that closes the
// round-trip loop.
//
// Both directions are bound by ONE convention (`req-tag-on-scenario`): emit
// writes each scenario's OWN slug as its `@<slug>` tag; ingest recovers the
// slug from that SAME tag. Pure and deterministic — no IO, no clock, no throw.
// See docs/traceability/spec.md §3/§4.4/§4.5.

import type { Scenario, TestRun } from '@workspec/req-schema';
import { renderFeatureFile } from './gherkin.js';
import { foldVerdict } from './verdict.js';
import type { Verdict } from './verdict.js';
import type {
  Emitter,
  EmitterConvention,
  EmittedFile,
  RuleWithScenarios,
  RunMeta,
} from './types.js';

/** The emitter's name — becomes `TestRun.emitter` on ingest and the registry key. */
const CUCUMBER_NAME = 'cucumber';

/** The four conventions this emitter declares and honors (spec §3), as UI-displayable data. */
export const CUCUMBER_CONVENTIONS: readonly EmitterConvention[] = [
  {
    name: 'feature-file-per-rule',
    description:
      'Each system-requirement (Rule) emits exactly one .feature file, named for the sysreq slug.',
  },
  {
    name: 'rule-groups-scenarios',
    description:
      'The file is Feature: > Rule: > one Scenario:/Scenario Outline: per scenario the Rule groups.',
  },
  {
    name: 'req-tag-on-scenario',
    description:
      'Each emitted scenario carries its OWN scenario slug as a Gherkin tag (@<scenario-slug>) — the load-bearing binding ingest keys back on.',
  },
  {
    name: 'outline-from-examples',
    description:
      'A scenario with an examples table emits a Scenario Outline + Examples block; otherwise a plain Scenario.',
  },
];

// ── The Cucumber JSON report shape (for callers that BUILD reports) ───────────
//
// The subset of the standard Cucumber JSON format this emitter reads. `ingest`
// itself takes `unknown` and parses defensively — these typed shapes are what a
// well-formed report (e.g. `mockCucumberRun`, or the T4 CLI's real toolchain
// output) looks like.

/** A step's execution status in a Cucumber JSON report. */
export type CucumberStatus =
  'passed' | 'failed' | 'skipped' | 'pending' | 'undefined' | 'ambiguous';

/** A Gherkin tag on a scenario, e.g. `{ name: "@inline-create-persists" }`. */
export interface CucumberTag {
  name: string;
  line?: number;
}

/** One executed step and its result. */
export interface CucumberStep {
  keyword?: string;
  name?: string;
  result?: { status?: CucumberStatus; duration?: number; error_message?: string };
}

/** One scenario (or expanded Scenario Outline row) within a feature. */
export interface CucumberElement {
  keyword?: string;
  type?: string;
  name?: string;
  tags?: CucumberTag[];
  steps?: CucumberStep[];
}

/** One feature in a Cucumber JSON report. */
export interface CucumberFeature {
  uri?: string;
  keyword?: string;
  name?: string;
  tags?: CucumberTag[];
  elements?: CucumberElement[];
}

/** A Cucumber JSON report: a top-level array of features. */
export type CucumberReport = CucumberFeature[];

// ── Defensive parsing primitives (never throw on malformed input) ─────────────

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Recover the scenario slug from a scenario element's tags (the
 * `req-tag-on-scenario` convention). Uses the FIRST tag that carries a name,
 * stripping a leading `@`. Returns `undefined` when no tag is present — the
 * caller then ignores the element (a `Background`, or an untagged scenario in a
 * brownfield suite). A brownfield scenario carrying several tags is keyed on
 * its first; disambiguating against the known slug set is a T4 CLI concern (it
 * holds the tree; the pure emitter does not).
 */
function recoverSlug(element: Record<string, unknown>): string | undefined {
  for (const tag of asArray(element['tags'])) {
    const name = asString(asRecord(tag)['name']);
    if (name === undefined) continue;
    const slug = name.startsWith('@') ? name.slice(1) : name;
    if (slug.length > 0) return slug;
  }
  return undefined;
}

/**
 * Classify one step's status. `passed` → pass; `failed`/`ambiguous`/`undefined`
 * → fail; everything else (`skipped`, `pending`, an unknown status, or a
 * missing result) → skip. Being lenient (unknown → skip, not fail) avoids
 * over-claiming a failure on a report shape we don't recognise.
 */
function classifyStep(status: string | undefined): Verdict {
  switch (status) {
    case 'passed':
      return 'pass';
    case 'failed':
    case 'ambiguous':
    case 'undefined':
      return 'fail';
    default:
      return 'skip';
  }
}

/**
 * Aggregate one scenario element's step statuses to ONE verdict: any
 * fail-triggering step → `fail`; else all steps passed → `pass`; otherwise
 * (only skip/pending steps, or NO steps at all) → `skip`. An empty scenario is
 * `skip` — zero passing steps is no proof.
 */
function scenarioVerdict(element: Record<string, unknown>): Verdict {
  const steps = asArray(element['steps']);
  let sawStep = false;
  let sawFail = false;
  let allPass = true;
  for (const step of steps) {
    sawStep = true;
    const verdict = classifyStep(asString(asRecord(asRecord(step)['result'])['status']));
    if (verdict === 'fail') sawFail = true;
    if (verdict !== 'pass') allPass = false;
  }
  if (sawFail) return 'fail';
  if (sawStep && allPass) return 'pass';
  return 'skip';
}

/**
 * Recover the report value `ingest` should scan: the CLI's contract (spec §6)
 * is that `raw` is the report's RAW TEXT — a Cucumber JSON report is a JSON
 * string, so `ingest` `JSON.parse`s it here, defensively (malformed JSON, or
 * JSON that doesn't parse to an array, yields `[]` rather than throwing — the
 * caller sees empty `results`, never a crash). A caller that already holds the
 * parsed array/object (e.g. `mockCucumberRun`'s output, consumed directly by
 * the round-trip conformance harness) may pass it through as-is — `ingest`
 * only parses when `raw` is a `string`.
 */
function parseReport(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Parse a Cucumber JSON report into a `TestRun` (spec §4.6), keyed on the
 * SCENARIO slug ALONE. `raw` is the report's raw JSON TEXT (the CLI's
 * contract) OR an already-parsed array/object (the round-trip conformance
 * harness's contract) — see {@link parseReport}. Defensive: never throws — a
 * non-string/unparseable `raw`, a non-array report, or any malformed
 * feature/element/step, is skipped rather than fatal. `results` keys are
 * sorted so the output is byte-stable / CI-diffable.
 */
function ingest(raw: unknown, meta: RunMeta): TestRun {
  const folded = new Map<string, Verdict>();
  for (const feature of asArray(parseReport(raw))) {
    for (const element of asArray(asRecord(feature)['elements'])) {
      const el = asRecord(element);
      const slug = recoverSlug(el);
      if (slug === undefined) continue;
      folded.set(slug, foldVerdict(folded.get(slug), scenarioVerdict(el)));
    }
  }

  const results: Record<string, Verdict> = {};
  for (const slug of [...folded.keys()].sort()) {
    const verdict = folded.get(slug);
    if (verdict !== undefined) results[slug] = verdict;
  }

  return {
    id: meta.id,
    ts: meta.ts,
    emitter: CUCUMBER_NAME,
    results,
    ...(meta.sha !== undefined ? { sha: meta.sha } : {}),
    ...(meta.ci !== undefined ? { ci: meta.ci } : {}),
  };
}

/** The `cucumber` emitter — the module's first concrete provider on the seam. */
export const cucumberEmitter: Emitter = {
  name: CUCUMBER_NAME,
  conventions: CUCUMBER_CONVENTIONS,
  emit(rules: readonly RuleWithScenarios[]): EmittedFile[] {
    return rules
      .map((rule) => ({ path: `${rule.sysreq.slug}.feature`, content: renderFeatureFile(rule) }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  ingest,
};

// ── The mock runner (test double) — closes the round-trip loop ────────────────
//
// A real cucumber run of the emitted `.feature` files produces a Cucumber JSON
// report; `mockCucumberRun` SYNTHESISES that report from the same rules+
// scenarios `emit` consumed — one Cucumber "feature" per Rule (mirroring
// `emit`'s one-file-per-Rule shape), one element per scenario (an `examples`
// table expands to one element PER ROW), each tagged `@<scenario-slug>` with
// step statuses mirroring the emit shape. That is exactly the seam the
// round-trip conformance harness exercises (emit → run → ingest → prove).

/** Which scenarios the mock runner should report as non-passing (default: all pass). */
export interface MockRunOptions {
  /** Scenario slugs whose scenario should report a failed step. */
  failing?: readonly string[];
  /** Scenario slugs whose scenario should report only skipped steps. */
  skipping?: readonly string[];
}

/** Flatten a scenario spec's given/when/then into ordered `{ keyword, name }` steps. */
function flattenSteps(spec: Scenario['spec']): { keyword: string; name: string }[] {
  const blocks: [string, readonly string[]][] = [
    ['Given', spec.given ?? []],
    ['When', spec.when ?? []],
    ['Then', spec.then],
  ];
  const flat: { keyword: string; name: string }[] = [];
  for (const [keyword, steps] of blocks) {
    steps.forEach((name, index) =>
      flat.push({ keyword: index === 0 ? `${keyword} ` : 'And ', name }),
    );
  }
  return flat;
}

/** The status of the step at `index` for a scenario whose overall outcome is `outcome`. */
function stepStatus(outcome: Verdict, index: number, lastIndex: number): CucumberStatus {
  if (outcome === 'skip') return 'skipped';
  if (outcome === 'fail') return index === lastIndex ? 'failed' : 'passed';
  return 'passed';
}

function scenarioSteps(spec: Scenario['spec'], outcome: Verdict): CucumberStep[] {
  const flat = flattenSteps(spec);
  const lastIndex = flat.length - 1;
  return flat.map((step, index) => ({
    keyword: step.keyword,
    name: step.name,
    result: { status: stepStatus(outcome, index, lastIndex) },
  }));
}

/**
 * Synthesise the Cucumber JSON report a passing (or, per `options`, partly
 * failing/skipping) run of the emitted features would produce. A scenario with
 * an `examples` table expands to one element PER ROW — all carrying the same
 * `@<scenario-slug>` tag — so ingest's outline-row fold is exercised too.
 */
export function mockCucumberRun(
  rules: readonly RuleWithScenarios[],
  options: MockRunOptions = {},
): CucumberReport {
  const failing = new Set(options.failing ?? []);
  const skipping = new Set(options.skipping ?? []);

  return rules.map((rule) => {
    const elements: CucumberElement[] = rule.scenarios.flatMap(({ slug, artifact }) => {
      const spec = artifact.spec;
      const examples = spec.examples ?? [];
      const hasExamples = examples.length > 0;
      const rowCount = hasExamples ? examples.length : 1;

      const outcomeForRow = (rowIndex: number): Verdict => {
        if (skipping.has(slug)) return 'skip';
        if (failing.has(slug) && rowIndex === rowCount - 1) return 'fail';
        return 'pass';
      };

      return Array.from({ length: rowCount }, (_unused, rowIndex) => ({
        keyword: hasExamples ? 'Scenario Outline' : 'Scenario',
        type: 'scenario',
        name: spec.title,
        tags: [{ name: `@${slug}` }],
        steps: scenarioSteps(spec, outcomeForRow(rowIndex)),
      }));
    });

    return {
      uri: `${rule.sysreq.slug}.feature`,
      keyword: 'Feature',
      name: rule.sysreq.artifact.spec.feature,
      elements,
    };
  });
}
