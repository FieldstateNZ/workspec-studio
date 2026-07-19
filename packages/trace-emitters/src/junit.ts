// The `junit` emitter — emit (Rules+scenarios → JUnit XML files) + ingest
// (JUnit XML report → TestRun), plus a mock runner that closes the round-trip
// loop. The module's SECOND provider on the emitter seam (spec §3) — proof
// that the seam generalises beyond cucumber.
//
// Both directions are bound by ONE convention (`req-slug-as-testcase-name`):
// emit writes each scenario's OWN slug as its testcase's `name` attribute;
// ingest recovers the slug from that SAME attribute. Pure and deterministic —
// no IO, no clock, no throw. See docs/traceability/spec.md §3/§4.4/§4.5.
//
// Unlike Cucumber JSON (a parsed JS array), a JUnit report is XML TEXT — there
// is no widely-agreed parsed-JS shape to hand `ingest`, and this package ships
// no XML-parsing dependency (pure, no IO/DOM). So `ingest`'s `raw` is expected
// to be the report's raw XML STRING; a non-string `raw` (or a string with no
// recoverable `<testcase>` elements) defensively yields an EMPTY `TestRun`,
// exactly like cucumber's non-array-report case.

import type { TestRun } from '@workspec/req-schema';
import { renderJunitFile } from './junit-render.js';
import { escapeXml, unescapeXmlEntities } from './xml-escape.js';
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
const JUNIT_NAME = 'junit';

/** The four conventions this emitter declares and honors (spec §3), as UI-displayable data. */
export const JUNIT_CONVENTIONS: readonly EmitterConvention[] = [
  {
    name: 'testsuite-file-per-rule',
    description:
      'Each system-requirement (Rule) emits exactly one JUnit XML file, named for the sysreq slug.',
  },
  {
    name: 'rule-groups-testcases',
    description:
      'The file is one <testsuite> per Rule, one <testcase> per scenario, classname carrying the Rule slug.',
  },
  {
    name: 'req-slug-as-testcase-name',
    description:
      "Each emitted testcase's name attribute IS the scenario slug verbatim — the load-bearing binding ingest keys back on.",
  },
  {
    name: 'outline-row-fold',
    description:
      'A scenario with an examples table still emits ONE testcase; a run may report one execution per example row, all sharing that name — ingest folds them to one verdict.',
  },
];

// ── Defensive parsing primitives (never throw on malformed input) ─────────────

/** One recovered `<testcase>` element's opening-tag attribute text and inner body. */
interface RawTestcase {
  /** The raw text between `<testcase` and the tag's closing `>`/`/>`, e.g. ` name="x" classname="y"`. */
  attrs: string;
  /** The text between `<testcase ...>` and its matching `</testcase>` — empty for a self-closing tag. */
  body: string;
  /** True when the tag was NOT self-closing and its own body could not be reliably recovered —
   * either no `</testcase>` was found before end-of-file, or another `<testcase` open tag began
   * before this one's close (meaning the next `</testcase>` in the document belongs to THAT
   * testcase, not this one). Distinct from a well-formed self-closing (definitely-passed) tag. */
  malformed: boolean;
}

/**
 * Scan `xml` for every `<testcase>` element, wherever it is nested (a bare
 * `<testsuite>` root or a `<testsuites>` aggregate — this emitter's own
 * `emit` writes the former, but a real toolchain may write either). Never
 * throws: an unterminated tag — truncated at end-of-file, OR missing its OWN
 * `</testcase>` because another `<testcase` open tag begins first — is
 * reported as `malformed` rather than aborting the scan or bleeding into a
 * neighboring testcase's body (see the nesting check below).
 */
function extractTestcases(xml: string): RawTestcase[] {
  const found: RawTestcase[] = [];
  // The lookahead after "testcase" requires the next character to be
  // whitespace, `/`, or `>` — so a longer tag name like `<testcase-extra>`
  // is never mistaken for a `<testcase>` element.
  const openTag = /<testcase(?=[\s/>])([^>]*?)(\/)?>/g;
  const nextOpenTag = /<testcase(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = openTag.exec(xml)) !== null) {
    const attrs = match[1] ?? '';
    if (match[2] === '/') {
      found.push({ attrs, body: '', malformed: false });
      continue;
    }

    const bodyStart = openTag.lastIndex;
    const closeIdx = xml.indexOf('</testcase>', bodyStart);

    // Does another <testcase> open tag begin before THIS testcase's own
    // close (or does no close exist at all)? If so, treating the next
    // literal `</testcase>` as belonging to the CURRENT testcase would
    // silently swallow the next testcase's contents and drop it entirely.
    // Instead: the current testcase is unterminated/malformed — end its
    // body at that next open tag (consuming none of it), and resume
    // scanning from there so the following testcase is parsed as its own
    // entry with its own verdict.
    nextOpenTag.lastIndex = bodyStart;
    const nextOpen = nextOpenTag.exec(xml);
    const nextOpenIdx = nextOpen?.index ?? -1;
    if (nextOpenIdx !== -1 && (closeIdx === -1 || nextOpenIdx < closeIdx)) {
      found.push({ attrs, body: '', malformed: true });
      openTag.lastIndex = nextOpenIdx;
      continue;
    }

    if (closeIdx === -1) {
      found.push({ attrs, body: '', malformed: true });
      continue;
    }
    found.push({ attrs, body: xml.slice(bodyStart, closeIdx), malformed: false });
    openTag.lastIndex = closeIdx + '</testcase>'.length;
  }
  return found;
}

/**
 * Recover one double- or single-quoted attribute's value from a tag's raw
 * attribute text, unescaping XML entities. Returns `undefined` when the
 * attribute is absent. The `\b` boundary before `key` stops `name` from
 * matching inside `classname` — the two attributes never collide.
 */
function attrValue(attrs: string, key: string): string | undefined {
  const pattern = new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"|\\b${key}\\s*=\\s*'([^']*)'`);
  const match = pattern.exec(attrs);
  if (match === null) return undefined;
  return unescapeXmlEntities(match[1] ?? match[2] ?? '');
}

/**
 * Classify one `<testcase>`'s verdict. A `malformed` (unterminated) tag is
 * treated leniently as `skip` — there isn't enough evidence to claim a pass.
 * Otherwise: a `<failure>`/`<error>` child → `fail`; a `<skipped>` child (and
 * no failure/error) → `skip`; anything else — including a well-formed,
 * self-closing tag with NO children, the standard "this test passed cleanly"
 * shape most JUnit-producing tools emit — → `pass`.
 */
function classifyTestcase({ body, malformed }: RawTestcase): Verdict {
  if (malformed) return 'skip';
  if (/<failure\b|<error\b/.test(body)) return 'fail';
  if (/<skipped\b/.test(body)) return 'skip';
  return 'pass';
}

/**
 * Parse a JUnit XML report into a `TestRun` (spec §4.6), keyed on the
 * SCENARIO slug ALONE. Defensive: never throws — a non-string `raw`, or any
 * unterminated/malformed testcase, is handled leniently rather than fatally.
 * `results` keys are sorted so the output is byte-stable / CI-diffable.
 */
function ingest(raw: unknown, meta: RunMeta): TestRun {
  const xml = typeof raw === 'string' ? raw : '';
  const folded = new Map<string, Verdict>();
  for (const testcase of extractTestcases(xml)) {
    const slug = attrValue(testcase.attrs, 'name');
    if (slug === undefined || slug.length === 0) continue;
    folded.set(slug, foldVerdict(folded.get(slug), classifyTestcase(testcase)));
  }

  const results: Record<string, Verdict> = {};
  for (const slug of [...folded.keys()].sort()) {
    const verdict = folded.get(slug);
    if (verdict !== undefined) results[slug] = verdict;
  }

  return {
    id: meta.id,
    ts: meta.ts,
    emitter: JUNIT_NAME,
    results,
    ...(meta.sha !== undefined ? { sha: meta.sha } : {}),
    ...(meta.ci !== undefined ? { ci: meta.ci } : {}),
  };
}

/** The `junit` emitter — the module's second concrete provider on the seam. */
export const junitEmitter: Emitter = {
  name: JUNIT_NAME,
  conventions: JUNIT_CONVENTIONS,
  emit(rules: readonly RuleWithScenarios[]): EmittedFile[] {
    return rules
      .map((rule) => ({ path: `${rule.sysreq.slug}.xml`, content: renderJunitFile(rule) }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  ingest,
};

// ── The mock runner (test double) — closes the round-trip loop ────────────────
//
// A real JUnit-producing toolchain run of the emitted files' equivalent test
// suite would produce a JUnit XML report; `mockJunitRun` SYNTHESISES that
// report from the same rules+scenarios `emit` consumed — one `<testsuite>`
// per Rule (mirroring `emit`'s one-file-per-Rule shape), one `<testcase>` per
// scenario, expanded to one element PER EXAMPLES ROW (`outline-row-fold`),
// each carrying `name="<scenario-slug>"`. That is exactly the seam the
// round-trip conformance harness exercises (emit → run → ingest → prove).

/** Which scenarios the mock runner should report as non-passing (default: all pass). */
export interface MockJunitRunOptions {
  /** Scenario slugs whose testcase(s) should report a `<failure>`. */
  failing?: readonly string[];
  /** Scenario slugs whose testcase(s) should report a `<skipped>`. */
  skipping?: readonly string[];
}

/** Render one `<testcase>` execution for `outcome` — self-closing when it passed (the standard,
 * most common JUnit shape for a clean pass), else carrying the matching child element. */
function testcaseElement(ruleSlug: string, slug: string, outcome: Verdict): string {
  const openAttrs = `classname="${escapeXml(ruleSlug)}" name="${escapeXml(slug)}"`;
  if (outcome === 'fail') {
    return `<testcase ${openAttrs}><failure message="scenario failed"/></testcase>`;
  }
  if (outcome === 'skip') {
    return `<testcase ${openAttrs}><skipped/></testcase>`;
  }
  return `<testcase ${openAttrs}/>`;
}

/**
 * Synthesise the JUnit XML report a passing (or, per `options`, partly
 * failing/skipping) run of the emitted testsuites would produce. A scenario
 * with an `examples` table expands to one `<testcase>` PER ROW — all carrying
 * the same `name="<scenario-slug>"` — so ingest's outline-row fold is
 * exercised too. Only the LAST row of a `failing` scenario actually fails,
 * proving the fold picks up a failure buried among otherwise-passing rows.
 */
export function mockJunitRun(
  rules: readonly RuleWithScenarios[],
  options: MockJunitRunOptions = {},
): string {
  const failing = new Set(options.failing ?? []);
  const skipping = new Set(options.skipping ?? []);

  const suites = rules.map((rule) => {
    const cases = rule.scenarios.flatMap(({ slug, artifact }) => {
      const examples = artifact.spec.examples ?? [];
      const rowCount = examples.length > 0 ? examples.length : 1;

      const outcomeForRow = (rowIndex: number): Verdict => {
        if (skipping.has(slug)) return 'skip';
        if (failing.has(slug) && rowIndex === rowCount - 1) return 'fail';
        return 'pass';
      };

      return Array.from({ length: rowCount }, (_unused, rowIndex) =>
        testcaseElement(rule.sysreq.slug, slug, outcomeForRow(rowIndex)),
      );
    });

    return [
      `<testsuite name="${escapeXml(rule.sysreq.artifact.spec.title)}" tests="${cases.length}">`,
      ...cases,
      '</testsuite>',
    ].join('');
  });

  return `<?xml version="1.0" encoding="UTF-8"?><testsuites>${suites.join('')}</testsuites>`;
}
