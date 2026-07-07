import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Catalog, Decision, LeverType, LineType, OptionType } from '@workspec/decision-schema';
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { applyLevers, computeOption, lineEnvCost } from './cost.js';

// Property tests seeded from the hosting-platform catalog ids. Load the fixtures once.
const repoUrl = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const read = (rel: string): string => readFileSync(repoUrl(rel), 'utf8');

const catalogRes = parseCatalogYaml(read('examples/hosting-platform/platform.catalog.yaml'));
const decisionRes = parseDecisionYaml(
  read('examples/hosting-platform/hosting-platform.decision.yaml'),
);
if (!catalogRes.ok) throw new Error('catalog fixture failed to parse');
if (!decisionRes.ok) throw new Error('decision fixture failed to parse');
const catalog: Catalog = catalogRes.data;
const decision: Decision = decisionRes.data;

const ENVS = ['dev', 'test', 'prod'] as const;
const SKU_IDS = catalog.spec.skus.map((s) => s.id);
const MODE_IDS = catalog.spec.pricingModes.map((m) => m.id);
const SCHEDULE_IDS = catalog.spec.schedules.map((s) => s.id);
const COMMITTED_MODE_IDS = catalog.spec.pricingModes.filter((m) => m.committed).map((m) => m.id);

const qtyArb: fc.Arbitrary<Record<string, number>> = fc.record({
  dev: fc.nat({ max: 8 }),
  test: fc.nat({ max: 8 }),
  prod: fc.nat({ max: 8 }),
});

function skuLineArb(id: string): fc.Arbitrary<LineType> {
  return fc
    .record({
      sku: fc.constantFrom(...SKU_IDS),
      mode: fc.constantFrom(...MODE_IDS),
      schedule: fc.constantFrom(...SCHEDULE_IDS),
      tag: fc.constantFrom('steady-prod', 'nonprod-compute', 'batch'),
      group: fc.constantFrom('compute', 'data'),
      qty: qtyArb,
    })
    .map((r): LineType => ({
      id,
      label: id,
      flat: false,
      sku: r.sku,
      mode: r.mode,
      schedule: r.schedule,
      tag: r.tag,
      group: r.group,
      qty: r.qty,
    }));
}

function flatLineArb(id: string): fc.Arbitrary<LineType> {
  return fc
    .record({
      tag: fc.constantFrom('db', 'steady-prod', 'nonprod-compute'),
      amount: qtyArb,
    })
    .map((r): LineType => ({ id, label: id, flat: true, tag: r.tag, amount: r.amount }));
}

function linesArb(): fc.Arbitrary<LineType[]> {
  return fc
    .array(fc.boolean(), { minLength: 1, maxLength: 5 })
    .chain((kinds) =>
      fc.tuple(...kinds.map((isSku, i) => (isSku ? skuLineArb(`l${i}`) : flatLineArb(`l${i}`)))),
    )
    .map((lines) => lines as LineType[]);
}

// A single lever whose ops only set mode/schedule (the idempotent subset — no
// qtyScale, no addLines). Matches by one of the known tags.
function setLeverArb(): fc.Arbitrary<LeverType> {
  return fc
    .record({
      tag: fc.constantFrom('steady-prod', 'nonprod-compute', 'batch'),
      mode: fc.constantFrom(...MODE_IDS),
      schedule: fc.constantFrom(...SCHEDULE_IDS),
      enabled: fc.boolean(),
    })
    .map((r): LeverType => ({
      id: 'lev',
      label: 'Lever',
      enabled: r.enabled,
      patch: [{ match: { tags: [r.tag] }, set: { mode: r.mode, schedule: r.schedule } }],
    }));
}

function optionArb(): fc.Arbitrary<OptionType> {
  return fc
    .record({ lines: linesArb(), levers: fc.array(setLeverArb(), { maxLength: 3 }) })
    .map((r): OptionType => ({
      id: 'o',
      name: 'O',
      environments: [...ENVS],
      lines: r.lines,
      levers: r.levers,
      scores: {},
    }));
}

function costLines(lines: readonly LineType[]): Record<string, number> {
  const perEnv: Record<string, number> = {};
  for (const env of ENVS) {
    perEnv[env] = lines.reduce((sum, line) => sum + lineEnvCost(line, env, catalog), 0);
  }
  return perEnv;
}

describe('property: committed modes ignore schedule', () => {
  it('cost of a committed-mode SKU line is invariant to its schedule', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SKU_IDS),
        fc.constantFrom(...COMMITTED_MODE_IDS),
        fc.constantFrom(...SCHEDULE_IDS),
        fc.constantFrom(...SCHEDULE_IDS),
        qtyArb,
        fc.constantFrom(...ENVS),
        (sku, mode, s1, s2, qty, env) => {
          const base: LineType = { id: 'l', label: 'L', flat: false, sku, mode, schedule: s1, qty };
          const swapped: LineType = { ...base, schedule: s2 };
          return lineEnvCost(base, env, catalog) === lineEnvCost(swapped, env, catalog);
        },
      ),
    );
  });
});

describe('property: all levers disabled reproduces the base cost', () => {
  it('disabling every lever equals costing the raw lines', () => {
    fc.assert(
      fc.property(optionArb(), (option) => {
        const allOff: OptionType = {
          ...option,
          levers: (option.levers ?? []).map((lever) => ({ ...lever, enabled: false })),
        };
        const withoutLevers: OptionType = { ...option, levers: [] };
        const a = computeOption(allOff, decision, catalog);
        const b = computeOption(withoutLevers, decision, catalog);
        expect(a.perEnv).toEqual(b.perEnv);
        expect(a.monthly).toBe(b.monthly);
      }),
    );
  });
});

describe('property: applying a single set-lever is idempotent', () => {
  it('applying the lever twice equals applying it once (per-env cost)', () => {
    fc.assert(
      fc.property(linesArb(), setLeverArb(), (lines, leverArb) => {
        const lever: LeverType = { ...leverArb, enabled: true };
        const once = applyLevers({
          id: 'o',
          name: 'O',
          environments: [...ENVS],
          lines,
          levers: [lever],
          scores: {},
        });
        const twice = applyLevers({
          id: 'o',
          name: 'O',
          environments: [...ENVS],
          lines: once,
          levers: [lever],
          scores: {},
        });
        expect(costLines(twice)).toEqual(costLines(once));
      }),
    );
  });
});
