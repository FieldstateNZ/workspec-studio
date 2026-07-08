import { describe, expect, it } from 'vitest';
import { featureFactory } from '../../test/helpers/factories.js';
import { FeatureElement } from './feature.js';

describe('FeatureElement', () => {
  it('accepts a feature with title and description', () => {
    const result = FeatureElement.safeParse(featureFactory());
    expect(result.success).toBe(true);
  });

  it('accepts an empty-string description (required but not min-length constrained)', () => {
    const result = FeatureElement.safeParse(featureFactory({ description: '' }));
    expect(result.success).toBe(true);
  });

  it('rejects a missing description', () => {
    const { title } = featureFactory();
    const result = FeatureElement.safeParse({ title });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'description')).toBe(true);
    }
  });

  it('rejects a tags field — features have no tags, unlike other element kinds', () => {
    const result = FeatureElement.safeParse({ ...featureFactory(), tags: ['x'] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing title', () => {
    const result = FeatureElement.safeParse({ description: 'Exports invoices.' });
    expect(result.success).toBe(false);
  });
});
