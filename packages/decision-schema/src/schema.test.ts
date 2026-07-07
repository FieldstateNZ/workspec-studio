import { describe, expect, it } from 'vitest';
import { CatalogArtifact, DecisionArtifact, Line, Lever, identifier } from './index.js';

// Factories (not shared fixtures): each test builds the minimal valid artifact
// it needs, then mutates one field to exercise a rule.

function makeCatalog(): unknown {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Catalog',
    metadata: { id: 'cat', currency: 'NZD', asOf: '2026-07-01' },
    spec: {
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
    metadata: { id: 'dec', title: 'T', status: 'exploring' },
    spec: {
      context: 'ctx',
      catalog: './x.catalog.yaml',
      currency: 'NZD',
      environments: ['dev', 'prod'],
      criteria: [{ id: 'cost', label: 'Cost', weight: 1 }],
      options: [
        {
          id: 'a',
          name: 'A',
          environments: ['dev', 'prod'],
          lines: [{ id: 'l1', label: 'L1', flat: true, amount: { dev: 10, prod: 20 } }],
          scores: { cost: { score: 3 } },
        },
      ],
    },
  };
}

/** Mutate the (single) option of a decision produced by `makeDecision`. */
function withOption(mutate: (opt: Record<string, unknown>) => void): unknown {
  const doc = makeDecision();
  const spec = doc.spec as { options: Record<string, unknown>[] };
  mutate(spec.options[0]!);
  return doc;
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
    cat.spec.schedules[0]!.pct = 1.5;
    const res = CatalogArtifact.safeParse(cat);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]!.path).toEqual(['spec', 'schedules', 0, 'pct']);
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
      expect(res.error.issues[0]!.path).toEqual(['flat']);
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

describe('DecisionArtifact cross-field integrity', () => {
  it('parses a minimal valid decision', () => {
    expect(DecisionArtifact.safeParse(makeDecision()).success).toBe(true);
  });

  it('rejects an option environment not declared on the decision', () => {
    const doc = withOption((opt) => {
      opt.environments = ['dev', 'staging'];
    });
    const res = DecisionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]!.path).toEqual(['spec', 'options', 0, 'environments', 1]);
    }
  });

  it('rejects a per-env line key not declared on the decision', () => {
    const doc = withOption((opt) => {
      (opt.lines as { amount: Record<string, number> }[])[0]!.amount = {
        dev: 10,
        staging: 5,
      };
    });
    const res = DecisionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.at(-1) === 'staging')).toBe(true);
    }
  });

  it('rejects a score for an undeclared criterion', () => {
    const doc = withOption((opt) => {
      opt.scores = { cost: { score: 3 }, nope: { score: 1 } };
    });
    const res = DecisionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.at(-1) === 'nope')).toBe(true);
    }
  });

  it('rejects an outcome that references an unknown option', () => {
    const doc = makeDecision();
    (doc.spec as { outcome?: unknown }).outcome = {
      option: 'ghost',
      rationale: 'because',
    };
    const res = DecisionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]!.path).toEqual(['spec', 'outcome', 'option']);
    }
  });

  it('accepts a well-formed decided outcome', () => {
    const doc = makeDecision();
    (doc.metadata as { status: string }).status = 'decided';
    (doc.spec as { outcome?: unknown }).outcome = {
      option: 'a',
      rationale: 'we accept X for Y',
    };
    expect(DecisionArtifact.safeParse(doc).success).toBe(true);
  });
});
