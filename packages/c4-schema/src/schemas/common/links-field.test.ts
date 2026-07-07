import { describe, expect, it } from 'vitest';
import { linksField } from './links-field.js';

describe('linksField', () => {
  it('accepts a single {linkType: pathRef} entry', () => {
    const result = linksField.safeParse([{ adr: '~/docs/architecture/README.md' }]);
    expect(result.success).toBe(true);
  });

  it('accepts a @workspace/-rooted pathRef', () => {
    const result = linksField.safeParse([{ spec: '@workspace/shared/spec.yaml' }]);
    expect(result.success).toBe(true);
  });

  it('accepts an entry carrying a valid cardinality alongside the link pair', () => {
    const result = linksField.safeParse([
      {
        'entity-relates-to-entity': '~/data/order.yaml',
        cardinality: { from: '1', to: '0..*', label: 'owns' },
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts a cardinality without a label', () => {
    const result = linksField.safeParse([
      { 'entity-relates-to-entity': '~/data/order.yaml', cardinality: { from: '0..1', to: '1..*' } },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects a cardinality with a bad enum value', () => {
    const result = linksField.safeParse([
      { 'entity-relates-to-entity': '~/data/order.yaml', cardinality: { from: 'many', to: '1' } },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('invalid cardinality');
    }
  });

  it('rejects an entry with two linkType keys', () => {
    const result = linksField.safeParse([{ adr: '~/docs/a.md', runbook: '~/docs/b.md' }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('exactly one');
    }
  });

  it('rejects an entry that is only a cardinality key (no link pair)', () => {
    const result = linksField.safeParse([{ cardinality: { from: '1', to: '1' } }]);
    expect(result.success).toBe(false);
  });

  it('rejects a non-string pathRef', () => {
    const result = linksField.safeParse([{ adr: 42 }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('string pathRef');
    }
  });

  it('rejects a bare path (no ~/ or @workspace/ prefix)', () => {
    const result = linksField.safeParse([{ adr: 'docs/architecture/README.md' }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('~/');
    }
  });
});
