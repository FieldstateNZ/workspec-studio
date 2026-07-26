import { describe, expect, it } from 'vitest';
import { mergeCost } from './merge-cost.js';

const BASE = { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 2 } as const;

describe('mergeCost', () => {
  it('returns null when both base and patch are absent', () => {
    expect(mergeCost(undefined, undefined)).toBeNull();
  });

  it('returns the base verbatim when there is no patch', () => {
    expect(mergeCost({ ...BASE }, undefined)).toEqual({ ...BASE });
  });

  it('a patch field replaces the matching base field; unnamed fields inherit the base', () => {
    expect(mergeCost({ ...BASE }, { qty: 5 })).toEqual({ ...BASE, qty: 5 });
  });

  it('a full patch replaces every named field', () => {
    expect(
      mergeCost({ ...BASE }, { sku: 'p2v3', mode: 'ri1y', schedule: 'always', qty: 1 }),
    ).toEqual({
      sku: 'p2v3',
      mode: 'ri1y',
      schedule: 'always',
      qty: 1,
    });
  });

  it('attribution is a whole-array replace, never an element-wise splice', () => {
    const base = { ...BASE, attribution: [{ container: 'api', share: 1 }] };
    const patch = {
      attribution: [
        { container: 'worker', share: 0.5 },
        { container: 'api', share: 0.5 },
      ],
    };
    expect(mergeCost(base, patch)?.attribution).toEqual(patch.attribution);
  });

  it('a base with attribution keeps it when the patch names no attribution at all', () => {
    const base = { ...BASE, attribution: [{ container: 'api', share: 1 }] };
    expect(mergeCost(base, { qty: 9 })?.attribution).toEqual(base.attribution);
  });

  it('no base + a complete patch (sku/mode/schedule) manufactures a whole new cost binding', () => {
    expect(mergeCost(undefined, { sku: 'p1v3', mode: 'payg', schedule: 'always' })).toEqual({
      sku: 'p1v3',
      mode: 'payg',
      schedule: 'always',
      qty: 1, // defaults to 1 when the patch doesn't name it either
    });
  });

  it('no base + a complete patch with an explicit qty honours it', () => {
    expect(
      mergeCost(undefined, { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 4 })?.qty,
    ).toBe(4);
  });

  it('SILENT-DISCARD BRANCH: no base + an incomplete patch (missing sku/mode/schedule) discards the patch entirely and returns null', () => {
    // This is the one surprising edge worth a dedicated test: a resource
    // with no `spec.cost` at all, whose ONLY per-env cost data is a partial
    // override like `{ qty: 5 }`, ends up with `cost: null` for that
    // environment — `qty: 5` is silently thrown away rather than raising a
    // diagnostic, because a patch can never manufacture a whole binding out
    // of pieces that don't include all three required identity fields. An
    // author who intends "this resource IS priced, just at a different qty
    // in this environment" must also author the base `spec.cost` with
    // sku/mode/schedule — the override alone is not enough.
    expect(mergeCost(undefined, { qty: 5 })).toBeNull();
    expect(mergeCost(undefined, { sku: 'p1v3' })).toBeNull();
    expect(mergeCost(undefined, { sku: 'p1v3', mode: 'payg' })).toBeNull();
    expect(mergeCost(undefined, { attribution: [{ container: 'api', share: 1 }] })).toBeNull();
  });

  it('no base + no patch at all is null (not the discard branch, just genuinely nothing)', () => {
    expect(mergeCost(undefined, {})).toBeNull();
  });
});
