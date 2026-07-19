import { describe, expect, it } from 'vitest';
import { API_VERSION } from '@workspec/schema-core';
import { FeatureArtifact, FeatureSpec } from './feature.js';

describe('FeatureSpec', () => {
  it('accepts a minimal feature (name only)', () => {
    const result = FeatureSpec.safeParse({ name: 'Element authoring' });
    expect(result.success).toBe(true);
  });

  it('accepts name and product', () => {
    const result = FeatureSpec.safeParse({ name: 'Element authoring', product: 'workspec-studio' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = FeatureSpec.safeParse({ product: 'workspec-studio' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = FeatureSpec.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('FeatureArtifact', () => {
  it('validates the full envelope from docs/traceability/spec.md §4.2', () => {
    const result = FeatureArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: { slug: 'element-authoring' },
      spec: { name: 'Element authoring', product: 'workspec-studio' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects the wrong kind literal', () => {
    const result = FeatureArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'NotAFeature',
      metadata: { slug: 'element-authoring' },
      spec: { name: 'Element authoring' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a spec missing name', () => {
    const result = FeatureArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: { slug: 'element-authoring' },
      spec: {},
    });
    expect(result.success).toBe(false);
  });
});
