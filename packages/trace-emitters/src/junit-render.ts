// Pure JUnit XML rendering — the EMIT side of the junit emitter.
//
// Turns one `RuleWithScenarios` into the text of one JUnit XML file,
// deterministically (stable ordering, escaped values) so the output is
// snapshot-testable and CI-diffable. No IO, no clock. Shape (spec §3,
// this package's `JUNIT_CONVENTIONS`): one `<testsuite>` per Rule, one
// `<testcase>` per scenario the Rule groups, `name` carrying the scenario's
// OWN slug (`req-slug-as-testcase-name` — the load-bearing binding `junit.ts`'s
// `ingest` keys back on) and `classname` carrying the Rule's slug
// (`rule-groups-testcases`). See docs/traceability/spec.md §3/§4.4/§4.5.

import type { RuleWithScenarios, ScenarioInput } from './types.js';
import { escapeXml } from './xml-escape.js';

const CASE_INDENT = '    ';
const PROPS_INDENT = '      ';
const PROP_INDENT = '        ';

/**
 * Render one scenario as a `<testcase>` element. `name` IS the scenario's
 * slug verbatim (`req-slug-as-testcase-name`) — the one field `ingest`
 * recovers, unambiguous by construction. `classname` is the Rule's slug,
 * grouping every testcase under its Rule the way a JUnit report normally
 * groups testcases under a class (`rule-groups-testcases`). The scenario's
 * human title is carried in a companion `<properties>` block for
 * readability ONLY — `ingest` never reads it, so a title containing
 * anything (even another scenario's slug) can never be mistaken for the
 * binding.
 */
function renderTestcase(ruleSlug: string, scenario: ScenarioInput): string[] {
  const title = escapeXml(scenario.artifact.spec.title);
  return [
    `${CASE_INDENT}<testcase classname="${escapeXml(ruleSlug)}" name="${escapeXml(scenario.slug)}">`,
    `${PROPS_INDENT}<properties>`,
    `${PROP_INDENT}<property name="title" value="${title}"/>`,
    `${PROPS_INDENT}</properties>`,
    `${CASE_INDENT}</testcase>`,
  ];
}

/**
 * Render the full text of the JUnit XML file for one Rule
 * (`testsuite-file-per-rule`): an XML declaration, then one `<testsuite>`
 * named for the Rule's title carrying a `tests` count, then one `<testcase>`
 * per scenario the Rule groups (`rule-groups-testcases`) — regardless of
 * whether the scenario carries an `examples` table. Unlike Gherkin, JUnit XML
 * has no native "outline" construct, so `emit` always renders exactly ONE
 * testcase per scenario; a real (or mock) RUN may report several EXECUTIONS
 * of it, one per example row, all sharing the same `name` — `junit.ts` folds
 * those back to one verdict (`outline-row-fold`). A Rule with no scenarios
 * renders a single self-closing, empty `<testsuite tests="0"/>` (an "empty
 * rule", spec §4.7). Ends with a trailing newline, never two.
 */
export function renderJunitFile(rule: RuleWithScenarios): string {
  const title = escapeXml(rule.sysreq.artifact.spec.title);
  const count = rule.scenarios.length;

  if (count === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${title}" tests="0"/>\n`;
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${title}" tests="${count}">`,
    ...rule.scenarios.flatMap((scenario) => renderTestcase(rule.sysreq.slug, scenario)),
    '</testsuite>',
  ];
  return `${lines.join('\n')}\n`;
}
