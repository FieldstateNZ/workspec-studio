// Seed data for the in-browser Cost demo. The worked example
// (`examples/fieldstate-azure-costs/`) is vendored as raw YAML and parsed at
// runtime into a single MemoryRepository, so the demo runs with zero network
// calls after load. The YAML is a verbatim copy of that example's own files —
// the same 80-resource, 9-resource-group "fieldstate-azure" estate the CLI
// and `@workspec/cost-ui`'s own smoke test exercise. It deliberately starts
// at 81.2% product coverage, with three resource-group clusters left for a
// human or WebMCP agent to inspect and promote into rules.
import {
  createMemoryRepository,
  parseAttributionYaml,
  parseInventoryYaml,
  parseSpendYaml,
  parseTagPlanYaml,
  type Attribution,
  type CostRepositoryPort,
  type Inventory,
  type Ref,
  type Spend,
  type TagPlan,
} from '@workspec/cost-schema';

import inventoryYaml from './examples-cost/fieldstate-azure.inventory.yaml?raw';
import spendYaml from './examples-cost/fieldstate-azure.spend.yaml?raw';
import attributionYaml from './examples-cost/fieldstate-azure.attribution.yaml?raw';
import tagPlanYaml from './examples-cost/fieldstate-azure.tagplan.yaml?raw';

export const COST_DEMO_ESTATE_NAME = 'fieldstate-azure';
export const COST_DEMO_PERIOD = '2026-07';
export const COST_DEMO_INVENTORY_REF: Ref = 'fieldstate-azure.inventory.yaml';
export const COST_DEMO_SPEND_REF: Ref = 'fieldstate-azure.spend.yaml';
export const COST_DEMO_ATTRIBUTION_REF: Ref = 'fieldstate-azure.attribution.yaml';
export const COST_DEMO_TAGPLAN_REF: Ref = 'fieldstate-azure.tagplan.yaml';

function parseInventory(ref: Ref, yaml: string): Inventory {
  const result = parseInventoryYaml(yaml);
  if (!result.ok) {
    throw new Error(
      `cost demo seed: inventory "${ref}" invalid — ${result.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

function parseSpend(ref: Ref, yaml: string): Spend {
  const result = parseSpendYaml(yaml);
  if (!result.ok) {
    throw new Error(
      `cost demo seed: spend "${ref}" invalid — ${result.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

function parseAttribution(ref: Ref, yaml: string): Attribution {
  const result = parseAttributionYaml(yaml);
  if (!result.ok) {
    throw new Error(
      `cost demo seed: attribution "${ref}" invalid — ${result.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

function parseTagPlan(ref: Ref, yaml: string): TagPlan {
  const result = parseTagPlanYaml(yaml);
  if (!result.ok) {
    throw new Error(
      `cost demo seed: tag plan "${ref}" invalid — ${result.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

/**
 * A fresh in-memory repository preloaded with the worked "fieldstate-azure"
 * estate. Each call returns an isolated repository so a "reset" fully
 * discards in-browser edits.
 */
export function createCostDemoRepository(): CostRepositoryPort {
  return createMemoryRepository(createCostDemoSeed());
}

export function createCostDemoSeed() {
  return {
    inventories: {
      [COST_DEMO_INVENTORY_REF]: parseInventory(COST_DEMO_INVENTORY_REF, inventoryYaml),
    },
    spends: { [COST_DEMO_SPEND_REF]: parseSpend(COST_DEMO_SPEND_REF, spendYaml) },
    attributions: {
      [COST_DEMO_ATTRIBUTION_REF]: parseAttribution(COST_DEMO_ATTRIBUTION_REF, attributionYaml),
    },
    tagPlans: { [COST_DEMO_TAGPLAN_REF]: parseTagPlan(COST_DEMO_TAGPLAN_REF, tagPlanYaml) },
  };
}
