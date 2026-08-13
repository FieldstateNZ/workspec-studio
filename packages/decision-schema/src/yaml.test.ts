import { describe, expect, it } from 'vitest';
import { parseDecisionYaml } from './yaml.js';

const valid = `apiVersion: workspec.io/v1alpha1
kind: Decision
metadata:
  slug: use-postgres
spec:
  title: Use PostgreSQL
  status: accepted
  created: '2026-08-13'
  context: A transactional store is required.
  decision: Use PostgreSQL.
`;

describe('parseDecisionYaml', () => {
  it('parses a core Decision', () => {
    const result = parseDecisionYaml(valid);
    expect(result.ok).toBe(true);
  });

  it('locates a missing required decision field', () => {
    const result = parseDecisionYaml(valid.replace('  decision: Use PostgreSQL.\n', ''));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.path).toBe('spec.decision');
  });

  it('rejects unknown fields instead of stripping them', () => {
    const result = parseDecisionYaml(`${valid}  catalog: legacy\n`);
    expect(result.ok).toBe(false);
  });
});
