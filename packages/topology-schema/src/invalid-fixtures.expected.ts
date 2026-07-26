// Manifest for the invalid-fixture battery in `test/fixtures/invalid/`.
//
// Each entry names a fixture that MUST fail validation, the artifact kind it
// should be parsed as, and the expected first-issue `path` + source `line`.
// The fixtures/tests together prove that (a) each distinct failure mode is
// rejected and (b) the Zod-issue-path → YAML-line mapping is correct.
// Mirrors `@workspec/decision-schema`'s `invalid-fixtures.expected.ts`.

export interface InvalidCase {
  /** Filename under `test/fixtures/invalid/`. */
  file: string;
  /** Which parser to run. */
  kind: 'topology' | 'resource' | 'environment';
  /** Expected `code` on the matched issue, when the case is about a distinguished custom issue rather than an ordinary schema-shape failure. */
  code?: string;
  /** What is wrong (documentation only). */
  reason: string;
  /** Expected dotted path of the (first) reported issue. */
  path: string;
  /** Expected 1-based YAML line of that issue. */
  line: number;
}

export const invalidCases: readonly InvalidCase[] = [
  {
    file: 'bad-resource-kind.resource.yaml',
    kind: 'resource',
    reason: 'spec.kind is not one of the closed resource-kind enum values',
    path: 'spec.kind',
    line: 8,
  },
  {
    file: 'bad-connection-class.topology.yaml',
    kind: 'topology',
    reason: 'a connection `class` is not one of "primary"/"telemetry"',
    path: 'spec.connections.0.class',
    line: 14,
  },
  {
    file: 'malformed-connection.topology.yaml',
    kind: 'topology',
    reason: 'a connection is missing the required `to` field',
    path: 'spec.connections.0.to',
    line: 12,
  },
  {
    file: 'default-env-not-declared.topology.yaml',
    kind: 'topology',
    reason: 'defaultEnvironment is not one of the declared spec.environments',
    path: 'spec.defaultEnvironment',
    line: 10,
  },
  {
    file: 'dangling-connection-env.topology.yaml',
    kind: 'topology',
    reason: "a connection's environments entry references an undeclared environment",
    path: 'spec.connections.0.environments.0',
    line: 15,
  },
  {
    file: 'bad-slug-environments.topology.yaml',
    kind: 'topology',
    reason: 'an environments entry is not a valid lowercase-hyphen slug',
    path: 'spec.environments.0',
    line: 9,
  },
  {
    file: 'share-out-of-range.resource.yaml',
    kind: 'resource',
    reason: 'a cost attribution share is greater than 1',
    path: 'spec.cost.attribution.0.share',
    line: 18,
  },
  {
    file: 'negative-override-qty.resource.yaml',
    kind: 'resource',
    reason: 'a resource override cost qty is negative (S1: overrides moved to Resource)',
    path: 'spec.overrides.prod.cost.qty',
    line: 14,
  },
  {
    file: 'legacy-environment-overrides.environment.yaml',
    kind: 'environment',
    reason:
      'a legacy v0 spec.overrides block on Environment, which S1 removed in favour of Resource.spec.overrides — must be rejected, not silently stripped',
    path: 'spec.overrides',
    line: 10,
    code: 'legacy-environment-overrides',
  },
];
