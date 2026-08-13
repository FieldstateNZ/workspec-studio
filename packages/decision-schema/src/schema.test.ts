import { describe, expect, it } from 'vitest';
import { CatalogArtifact, DecisionArtifact, Line, Lever, identifier } from './index.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// Factories (not shared fixtures): each test builds the minimal valid artifact
// it needs, then mutates one field to exercise a rule.

function makeCatalog(): unknown {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Catalog',
    metadata: { slug: 'cat' },
    spec: {
      currency: 'NZD',
      asOf: '2026-07-01',
      pricingModes: [{ id: 'payg', label: 'PAYG', mult: 1, committed: false }],
      schedules: [{ id: 'always', label: '24x7', pct: 1 }],
      skus: [{ id: 'd4s_v5', label: 'D4s v5', family: 'compute', price: 190 }],
    },
  };
}

function makeDecision(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Decision',
    metadata: { slug: 'dec' },
    spec: {
      title: 'T',
      status: 'proposed',
      context: 'ctx',
      decision: 'Choose A.',
    },
  };
}

describe('identifier', () => {
  it('accepts slugs and rejects non-slugs', () => {
    expect(identifier.safeParse('d4s_v5').success).toBe(true);
    expect(identifier.safeParse('opsBurden').success).toBe(true);
    expect(identifier.safeParse('has space').success).toBe(false);
    expect(identifier.safeParse('-leading').success).toBe(false);
    expect(identifier.safeParse('').success).toBe(false);
  });
});

describe('CatalogArtifact', () => {
  it('parses a minimal valid catalog', () => {
    expect(CatalogArtifact.safeParse(makeCatalog()).success).toBe(true);
  });

  it('rejects a schedule pct above 1', () => {
    const cat = makeCatalog() as { spec: { schedules: { pct: number }[] } };
    must(cat.spec.schedules[0]).pct = 1.5;
    const res = CatalogArtifact.safeParse(cat);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['spec', 'schedules', 0, 'pct']);
    }
  });

  it('rejects the wrong kind discriminant', () => {
    const cat = makeCatalog() as { kind: string };
    cat.kind = 'Decision';
    expect(CatalogArtifact.safeParse(cat).success).toBe(false);
  });
});

describe('Line (discriminated union on flat)', () => {
  it('defaults a missing flat to false on SKU lines (author convenience)', () => {
    const res = Line.safeParse({
      id: 'l',
      label: 'L',
      sku: 'd4s_v5',
      mode: 'payg',
      schedule: 'always',
      qty: { dev: 1 },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.flat).toBe(false);
      if (res.data.flat === false) expect(res.data.sku).toBe('d4s_v5');
    }
  });

  it('parses a flat line', () => {
    const res = Line.safeParse({
      id: 'l',
      label: 'L',
      flat: true,
      amount: { prod: 100 },
    });
    expect(res.success).toBe(true);
  });

  it('rejects an unknown discriminator value at path .flat', () => {
    const res = Line.safeParse({ id: 'l', label: 'L', flat: 'maybe' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['flat']);
    }
  });

  it('rejects a negative qty', () => {
    const res = Line.safeParse({
      id: 'l',
      label: 'L',
      flat: false,
      sku: 'd4s_v5',
      mode: 'payg',
      schedule: 'always',
      qty: { dev: -1 },
    });
    expect(res.success).toBe(false);
  });
});

describe('Lever', () => {
  it('defaults enabled to false', () => {
    const res = Lever.safeParse({
      id: 'lev',
      label: 'Lever',
      patch: [{ match: { tags: ['x'] }, set: { mode: 'ri3' } }],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.enabled).toBe(false);
  });

  it('requires at least one patch op', () => {
    const res = Lever.safeParse({ id: 'lev', label: 'Lever', patch: [] });
    expect(res.success).toBe(false);
  });
});

describe('DecisionArtifact core record', () => {
  it('parses a minimal valid decision', () => {
    expect(DecisionArtifact.safeParse(makeDecision()).success).toBe(true);
  });

  it('rejects legacy analysis fields instead of silently stripping them', () => {
    const doc = makeDecision();
    (doc.spec as { catalog?: string }).catalog = 'legacy';
    const res = DecisionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
  });

  it('accepts graph links and supporting references', () => {
    const doc = makeDecision();
    Object.assign(doc.spec as object, {
      links: [{ container: '~/containers/api.yaml' }],
      references: [{ kind: 'issue', target: 'https://example.com/issues/1' }],
    });
    expect(DecisionArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects malformed link refs and malformed dates', () => {
    const badLink = makeDecision();
    Object.assign(badLink.spec as object, { links: [{ container: 'banana' }] });
    expect(DecisionArtifact.safeParse(badLink).success).toBe(false);
    const badDate = makeDecision();
    Object.assign(badDate.spec as object, { created: '13/08/2026' });
    expect(DecisionArtifact.safeParse(badDate).success).toBe(false);
  });
});
