// Catalog reference validation. The S1 schema validates a decision in isolation;
// it cannot check that a SKU line's `sku`/`mode`/`schedule` actually resolve in
// the catalog (which the schema layer does not have in hand). The engine does.

import type { Catalog, Decision } from '@workspec/decision-schema';
import type { RefError } from './types.js';

/**
 * Check that every SKU line in the decision resolves its `sku`, `mode` and
 * `schedule` against the catalog. Returns one `RefError` per dangling
 * reference; an empty array means all references resolve. Flat lines are
 * skipped (they carry no catalog references).
 */
export function validateRefs(decision: Decision, catalog: Catalog): RefError[] {
  const skus = new Set(catalog.spec.skus.map((sku) => sku.id));
  const modes = new Set(catalog.spec.pricingModes.map((mode) => mode.id));
  const schedules = new Set(catalog.spec.schedules.map((schedule) => schedule.id));

  const errors: RefError[] = [];
  for (const option of decision.spec.options) {
    for (const line of option.lines) {
      if (line.flat) continue;
      if (!skus.has(line.sku)) {
        errors.push({
          optionId: option.id,
          lineId: line.id,
          field: 'sku',
          ref: line.sku,
          message: `unknown sku "${line.sku}" (not in catalog.spec.skus)`,
        });
      }
      if (!modes.has(line.mode)) {
        errors.push({
          optionId: option.id,
          lineId: line.id,
          field: 'mode',
          ref: line.mode,
          message: `unknown pricing mode "${line.mode}" (not in catalog.spec.pricingModes)`,
        });
      }
      if (!schedules.has(line.schedule)) {
        errors.push({
          optionId: option.id,
          lineId: line.id,
          field: 'schedule',
          ref: line.schedule,
          message: `unknown schedule "${line.schedule}" (not in catalog.spec.schedules)`,
        });
      }
    }
  }
  return errors;
}
