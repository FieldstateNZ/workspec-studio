import { describe, expect, it } from 'vitest';
import { MetadataSchema } from './metadata.js';

describe('MetadataSchema', () => {
  it('accepts an empty object (slug omitted — loader derives it from the filename)', () => {
    expect(MetadataSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid slug', () => {
    expect(MetadataSchema.safeParse({ slug: 'dev-lead' }).success).toBe(true);
  });

  it('rejects an invalid slug', () => {
    expect(MetadataSchema.safeParse({ slug: 'Dev Lead' }).success).toBe(false);
  });

  it('silently strips unknown keys rather than rejecting them', () => {
    const result = MetadataSchema.safeParse({ slug: 'dev-lead', futureField: 'anything' });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ slug: 'dev-lead' });
  });
});
