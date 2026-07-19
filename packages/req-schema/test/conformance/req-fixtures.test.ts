import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { FeatureArtifact } from '../../src/schemas/feature.js';
import { ScenarioArtifact } from '../../src/schemas/scenario.js';
import { SystemRequirementArtifact } from '../../src/schemas/system-requirement.js';
import { TestRun } from '../../src/schemas/test-run.js';
import { UserRequirementArtifact } from '../../src/schemas/user-requirement.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

function loadYaml(relativePath: string): unknown {
  return parse(readFileSync(join(fixturesDir, relativePath), 'utf8'));
}

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), 'utf8'));
}

/** The envelope schema each artifact `kind` literal dispatches to. */
const ARTIFACT_BY_KIND: Record<string, z.ZodType> = {
  Feature: FeatureArtifact,
  UserRequirement: UserRequirementArtifact,
  SystemRequirement: SystemRequirementArtifact,
  Scenario: ScenarioArtifact,
};

describe('valid fixtures', () => {
  const validYaml = [
    'element-authoring.yaml',
    'authoring-flow.yaml',
    'authoring-flow-linked.yaml',
    'inline-create.yaml',
    'inline-create-persists.yaml',
    'inline-create-each-kind.yaml',
  ];

  it.each(validYaml)('%s parses against its declared kind', (file) => {
    const doc = loadYaml(`valid/${file}`) as { kind?: string };
    const schema = doc.kind ? ARTIFACT_BY_KIND[doc.kind] : undefined;
    if (!schema) {
      throw new Error(`no schema registered for kind ${doc.kind}`);
    }
    const result = schema.safeParse(doc);
    expect(result.success, JSON.stringify(result.success ? {} : result.error.issues)).toBe(true);
  });

  it('the .runs/*.json evidence fixture parses against TestRun', () => {
    const result = TestRun.safeParse(loadJson('valid/2026-07-09T02-14Z.json'));
    expect(result.success).toBe(true);
  });
});

describe('invalid fixtures', () => {
  // Each fixture pairs with the schema it is meant to (but must not) satisfy,
  // and the field path the first error is expected on where it is stable.
  const cases: { file: string; schema: z.ZodType; expectedPath?: (string | number)[] }[] = [
    { file: 'feature-missing-name.yaml', schema: FeatureArtifact, expectedPath: ['spec', 'name'] },
    {
      file: 'user-requirement-wrong-kind.yaml',
      schema: UserRequirementArtifact,
      expectedPath: ['kind'],
    },
    {
      file: 'user-requirement-bad-actor-ref.yaml',
      schema: UserRequirementArtifact,
      expectedPath: ['spec', 'actor'],
    },
    {
      file: 'user-requirement-bad-status.yaml',
      schema: UserRequirementArtifact,
      expectedPath: ['spec', 'status'],
    },
    {
      file: 'system-requirement-missing-feature.yaml',
      schema: SystemRequirementArtifact,
      expectedPath: ['spec', 'feature'],
    },
    {
      file: 'scenario-missing-then.yaml',
      schema: ScenarioArtifact,
      expectedPath: ['spec', 'then'],
    },
    {
      file: 'scenario-bad-sysreq-ref.yaml',
      schema: ScenarioArtifact,
      expectedPath: ['spec', 'systemRequirement'],
    },
  ];

  it.each(cases)('$file fails validation', ({ file, schema, expectedPath }) => {
    const result = schema.safeParse(loadYaml(`invalid/${file}`));
    expect(result.success).toBe(false);
    if (!result.success && expectedPath) {
      const paths = result.error.issues.map((issue) => issue.path);
      expect(paths).toContainEqual(expectedPath);
    }
  });
});
