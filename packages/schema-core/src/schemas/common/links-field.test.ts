import { describe, expect, it } from 'vitest';
import { linksField } from './links-field.js';

describe('linksField', () => {
  it('is optional', () => {
    expect(linksField.safeParse(undefined).success).toBe(true);
  });

  it('accepts a single {linkType: pathRef} entry rooted at ~/', () => {
    const result = linksField.safeParse([{ adr: '~/docs/decisions/staffing.md' }]);
    expect(result.success).toBe(true);
  });

  it('accepts a package-relative @workspace/ ref', () => {
    const result = linksField.safeParse([{ runbook: '@workspace/runbooks/oncall.md' }]);
    expect(result.success).toBe(true);
  });

  it('accepts an entry with a cardinality key', () => {
    const result = linksField.safeParse([
      { 'relates-to': '~/actors/other.yaml', cardinality: { from: '1', to: '0..*' } },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects a path that does not start with ~/ or @workspace/', () => {
    const result = linksField.safeParse([{ adr: 'docs/decisions/staffing.md' }]);
    expect(result.success).toBe(false);
  });

  it('rejects an entry with more than one link-type key', () => {
    const result = linksField.safeParse([{ adr: '~/a.md', runbook: '~/b.md' }]);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid cardinality', () => {
    const result = linksField.safeParse([
      { 'relates-to': '~/a.yaml', cardinality: { from: 'nope', to: '1' } },
    ]);
    expect(result.success).toBe(false);
  });
});
