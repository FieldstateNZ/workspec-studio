import { describe, expect, it } from 'vitest';
import type { Catalog, Decision, LineType, OptionType } from '@workspec/decision-schema';
import { applyLevers, computeOption, lineEnvCost } from './cost.js';
import { validateRefs } from './validate.js';

// Factories (not shared fixtures): each test builds the minimal catalog / line
// it needs from catalog ids.

function makeCatalog(): Catalog {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Catalog',
    metadata: { id: 'cat', currency: 'NZD', asOf: '2026-07-01' },
    spec: {
      pricingModes: [
        { id: 'payg', label: 'PAYG', mult: 1, committed: false },
        { id: 'sp3', label: '3yr SP', mult: 0.56, committed: true },
        { id: 'ri3', label: '3yr RI', mult: 0.5, committed: true },
        { id: 'spot', label: 'Spot', mult: 0.18, committed: false },
      ],
      schedules: [
        { id: 'always', label: '24x7', pct: 1 },
        { id: 'business', label: 'Business', pct: 0.3 },
        { id: 'overnight', label: 'Overnight', pct: 0.22 },
      ],
      skus: [{ id: 'd4s_v5', label: 'D4s v5', family: 'compute', price: 190 }],
    },
  };
}

function skuLine(over: Partial<Extract<LineType, { flat: false }>> = {}): LineType {
  return {
    id: 'l',
    label: 'L',
    flat: false,
    sku: 'd4s_v5',
    mode: 'payg',
    schedule: 'always',
    qty: { dev: 1, test: 1, prod: 2 },
    ...over,
  };
}

function flatLine(over: Partial<Extract<LineType, { flat: true }>> = {}): LineType {
  return { id: 'f', label: 'F', flat: true, amount: { dev: 10, prod: 20 }, ...over };
}

describe('lineEnvCost', () => {
  const catalog = makeCatalog();

  it('flat line returns amount[env] or 0 for a missing env', () => {
    const line = flatLine({ amount: { dev: 10, prod: 20 } });
    expect(lineEnvCost(line, 'dev', catalog)).toBe(10);
    expect(lineEnvCost(line, 'prod', catalog)).toBe(20);
    expect(lineEnvCost(line, 'test', catalog)).toBe(0);
  });

  it('SKU line prices qty × price × mult × schedule pct', () => {
    // 190 * 1 * 2 * 1 = 380 (payg, always, prod qty 2)
    expect(lineEnvCost(skuLine(), 'prod', catalog)).toBe(380);
    // 190 * 1 * 2 * 0.3 = 114 (payg, business hrs)
    expect(lineEnvCost(skuLine({ schedule: 'business' }), 'prod', catalog)).toBe(114);
    // 190 * 0.18 * 2 * 0.22 = 15.048 (spot, overnight)
    expect(
      lineEnvCost(skuLine({ mode: 'spot', schedule: 'overnight' }), 'prod', catalog),
    ).toBeCloseTo(15.048, 10);
  });

  it('committed mode ignores the schedule (bills 24×7)', () => {
    const always = lineEnvCost(skuLine({ mode: 'ri3', schedule: 'always' }), 'prod', catalog);
    const business = lineEnvCost(skuLine({ mode: 'ri3', schedule: 'business' }), 'prod', catalog);
    expect(always).toBe(business);
    expect(always).toBe(190 * 0.5 * 2); // 190
  });

  it('zero qty short-circuits to 0', () => {
    expect(lineEnvCost(skuLine({ qty: { prod: 0 } }), 'prod', catalog)).toBe(0);
  });

  it('unknown SKU returns 0', () => {
    expect(lineEnvCost(skuLine({ sku: 'ghost' }), 'prod', catalog)).toBe(0);
  });

  it('unknown mode defaults to PAYG, unknown schedule defaults to 24×7', () => {
    // ghost mode → mult 1, non-committed; ghost schedule → pct 1: 190*1*2*1 = 380
    expect(lineEnvCost(skuLine({ mode: 'ghost', schedule: 'ghost' }), 'prod', catalog)).toBe(380);
  });
});

describe('applyLevers (declarative patch interpreter)', () => {
  function option(over: Partial<OptionType> = {}): OptionType {
    return {
      id: 'o',
      name: 'O',
      environments: ['dev', 'test', 'prod'],
      lines: [
        skuLine({ id: 'a', tag: 'steady-prod', group: 'compute' }),
        skuLine({ id: 'b', tag: 'batch', group: 'compute', qty: { prod: 2 } }),
        flatLine({ id: 'c', tag: 'db' }),
      ],
      scores: {},
      ...over,
    };
  }

  it('does not mutate the input option', () => {
    const opt = option({
      levers: [
        {
          id: 'r',
          label: 'R',
          enabled: true,
          patch: [{ match: { tags: ['steady-prod'] }, set: { mode: 'ri3' } }],
        },
      ],
    });
    const before = JSON.stringify(opt);
    applyLevers(opt);
    expect(JSON.stringify(opt)).toBe(before);
  });

  it('set.mode / set.schedule replace SKU line fields on matched lines only', () => {
    const opt = option({
      levers: [
        {
          id: 'r',
          label: 'R',
          enabled: true,
          patch: [{ match: { tags: ['steady-prod'] }, set: { mode: 'ri3' } }],
        },
      ],
    });
    const [a, b] = applyLevers(opt);
    expect(a?.flat === false && a.mode).toBe('ri3');
    expect(b?.flat === false && b.mode).toBe('payg'); // untouched (tag batch)
  });

  it('ignores set on flat lines', () => {
    const opt = option({
      levers: [
        {
          id: 's',
          label: 'S',
          enabled: true,
          patch: [{ match: { tags: ['db'] }, set: { schedule: 'business' } }],
        },
      ],
    });
    const lines = applyLevers(opt);
    const flat = lines.find((l) => l.id === 'c');
    expect(flat?.flat).toBe(true); // unchanged, no schedule field added
  });

  it('a disabled lever is a no-op', () => {
    const opt = option({
      levers: [
        {
          id: 'r',
          label: 'R',
          enabled: false,
          patch: [{ match: { tags: ['steady-prod'] }, set: { mode: 'ri3' } }],
        },
      ],
    });
    const a = applyLevers(opt).find((l) => l.id === 'a');
    expect(a?.flat === false && a.mode).toBe('payg');
  });

  it('qtyScale multiplies qty for the scoped envs only', () => {
    const opt = option({
      levers: [
        {
          id: 'q',
          label: 'Q',
          enabled: true,
          patch: [{ match: { ids: ['a'] }, set: { qtyScale: 3 } }],
        },
      ],
    });
    const a = applyLevers(opt).find((l) => l.id === 'a');
    // default envs = option envs → all of dev/test/prod scaled by 3
    expect(a?.flat === false && a.qty).toEqual({ dev: 3, test: 3, prod: 6 });
  });

  it('qtyScale honours match.envs scoping', () => {
    const opt = option({
      levers: [
        {
          id: 'q',
          label: 'Q',
          enabled: true,
          patch: [{ match: { ids: ['a'], envs: ['prod'] }, set: { qtyScale: 2 } }],
        },
      ],
    });
    const a = applyLevers(opt).find((l) => l.id === 'a');
    expect(a?.flat === false && a.qty).toEqual({ dev: 1, test: 1, prod: 4 });
  });

  it('addLines appends cloned lines to the set', () => {
    const opt = option({
      levers: [
        {
          id: 'add',
          label: 'Add',
          enabled: true,
          patch: [{ match: {}, addLines: [flatLine({ id: 'extra', amount: { prod: 5 } })] }],
        },
      ],
    });
    const lines = applyLevers(opt);
    expect(lines.map((l) => l.id)).toContain('extra');
  });

  it('matches by group and by id as well as by tag (OR across facets)', () => {
    const opt = option({
      levers: [
        {
          id: 'g',
          label: 'G',
          enabled: true,
          patch: [{ match: { groups: ['compute'] }, set: { mode: 'ri3' } }],
        },
      ],
    });
    const lines = applyLevers(opt);
    expect(lines.find((l) => l.id === 'a' && l.flat === false)?.flat === false).toBe(true);
    expect((lines.find((l) => l.id === 'a') as Extract<LineType, { flat: false }>).mode).toBe(
      'ri3',
    );
    expect((lines.find((l) => l.id === 'b') as Extract<LineType, { flat: false }>).mode).toBe(
      'ri3',
    );
  });
});

describe('computeOption', () => {
  const catalog = makeCatalog();

  function decisionWith(option: OptionType): Decision {
    return {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Decision',
      metadata: { id: 'd', title: 'T', status: 'exploring' },
      spec: {
        context: 'c',
        catalog: './x.catalog.yaml',
        currency: 'NZD',
        environments: ['dev', 'test', 'prod'],
        criteria: [],
        options: [option],
      },
    };
  }

  it('active envs follow decision order, filtered to the option', () => {
    const option: OptionType = {
      id: 'o',
      name: 'O',
      environments: ['prod', 'dev'], // authored out of order
      lines: [flatLine({ id: 'f', amount: { dev: 10, prod: 20 } })],
      scores: {},
    };
    const cost = computeOption(option, decisionWith(option), catalog);
    expect(cost.activeEnvs).toEqual(['dev', 'prod']);
  });

  it('complete is false when monthly is 0 even if complete !== false', () => {
    const option: OptionType = {
      id: 'z',
      name: 'Z',
      environments: ['dev'],
      lines: [flatLine({ id: 'f', amount: { dev: 0 } })],
      scores: {},
    };
    const cost = computeOption(option, decisionWith(option), catalog);
    expect(cost.monthly).toBe(0);
    expect(cost.complete).toBe(false);
  });

  it('headroom uses the lowest committed mult (ri3 = 0.5 here)', () => {
    const option: OptionType = {
      id: 'o',
      name: 'O',
      environments: ['prod'],
      lines: [skuLine({ id: 'a', mode: 'payg', schedule: 'always', qty: { prod: 2 } })],
      scores: {},
    };
    const cost = computeOption(option, decisionWith(option), catalog);
    // current 190*1*2*1 = 380; reserved 190*0.5*2 = 190; saving = 190
    expect(cost.headroom).toBe(190);
  });
});

describe('validateRefs', () => {
  const catalog = makeCatalog();

  function decisionWithLine(line: LineType): Decision {
    return {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Decision',
      metadata: { id: 'd', title: 'T', status: 'exploring' },
      spec: {
        context: 'c',
        catalog: './x.catalog.yaml',
        currency: 'NZD',
        environments: ['prod'],
        criteria: [],
        options: [{ id: 'o', name: 'O', environments: ['prod'], lines: [line], scores: {} }],
      },
    };
  }

  it('returns [] when all references resolve', () => {
    expect(validateRefs(decisionWithLine(skuLine({ qty: { prod: 1 } })), catalog)).toEqual([]);
  });

  it('reports a dangling sku, mode and schedule', () => {
    const line = skuLine({ sku: 'ghost', mode: 'ghost', schedule: 'ghost', qty: { prod: 1 } });
    const errors = validateRefs(decisionWithLine(line), catalog);
    expect(errors.map((e) => e.field)).toEqual(['sku', 'mode', 'schedule']);
    expect(errors[0]).toMatchObject({ optionId: 'o', lineId: 'l', field: 'sku', ref: 'ghost' });
  });

  it('skips flat lines', () => {
    expect(validateRefs(decisionWithLine(flatLine()), catalog)).toEqual([]);
  });
});
