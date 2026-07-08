// Lever reference warnings — a NON-fatal companion to the engine's
// `validateRefs`.
//
// `validateRefs` (S2) checks the catalog references authored directly on an
// option's SKU lines. It deliberately does NOT check the refs *inside* levers
// (`set.mode` / `set.schedule`, and any `addLines`), because the engine's patch
// interpreter falls back to PAYG / 24×7 for an unknown mode/schedule — so a typo
// there silently degrades rather than breaks. The CLI surfaces those as
// warnings so authors get feedback without the fallback semantics turning into a
// hard failure.

import type { Catalog, Decision } from '@workspec/decision-schema';

/** A dangling reference found inside a lever patch. */
export interface LeverRefWarning {
  /** The option the lever belongs to. */
  optionId: string;
  /** The lever id. */
  leverId: string;
  /** The 0-based option index (for source location). */
  optionIndex: number;
  /** The 0-based lever index (for source location). */
  leverIndex: number;
  /** The 0-based patch-op index (for source location). */
  patchIndex: number;
  /** Which kind of reference did not resolve. */
  field: 'mode' | 'schedule' | 'sku';
  /** The unresolved reference value. */
  ref: string;
  /** The dotted path to the offending node (for source location). */
  path: (string | number)[];
  /** Human-readable message. */
  message: string;
}

/**
 * Collect every dangling catalog reference inside the decision's levers: each
 * `set.mode` / `set.schedule`, and — for any lever `addLines` — the added SKU
 * lines' `sku` / `mode` / `schedule`. Returns an empty array when all resolve.
 */
export function collectLeverRefWarnings(decision: Decision, catalog: Catalog): LeverRefWarning[] {
  const modes = new Set(catalog.spec.pricingModes.map((m) => m.id));
  const schedules = new Set(catalog.spec.schedules.map((s) => s.id));
  const skus = new Set(catalog.spec.skus.map((s) => s.id));

  const warnings: LeverRefWarning[] = [];

  decision.spec.options.forEach((option, optionIndex) => {
    (option.levers ?? []).forEach((lever, leverIndex) => {
      lever.patch.forEach((op, patchIndex) => {
        const base = {
          optionId: option.id,
          leverId: lever.id,
          optionIndex,
          leverIndex,
          patchIndex,
        };
        const opPath = ['spec', 'options', optionIndex, 'levers', leverIndex, 'patch', patchIndex];

        if (op.set?.mode !== undefined && !modes.has(op.set.mode)) {
          warnings.push({
            ...base,
            field: 'mode',
            ref: op.set.mode,
            path: [...opPath, 'set', 'mode'],
            message: `lever "${lever.id}" sets unknown pricing mode "${op.set.mode}" (falls back to PAYG)`,
          });
        }
        if (op.set?.schedule !== undefined && !schedules.has(op.set.schedule)) {
          warnings.push({
            ...base,
            field: 'schedule',
            ref: op.set.schedule,
            path: [...opPath, 'set', 'schedule'],
            message: `lever "${lever.id}" sets unknown schedule "${op.set.schedule}" (falls back to 24×7)`,
          });
        }

        (op.addLines ?? []).forEach((line, lineIndex) => {
          if (line.flat) return;
          const linePath = [...opPath, 'addLines', lineIndex];
          if (!skus.has(line.sku)) {
            warnings.push({
              ...base,
              field: 'sku',
              ref: line.sku,
              path: [...linePath, 'sku'],
              message: `lever "${lever.id}" adds a line with unknown sku "${line.sku}" (costs as 0)`,
            });
          }
          if (!modes.has(line.mode)) {
            warnings.push({
              ...base,
              field: 'mode',
              ref: line.mode,
              path: [...linePath, 'mode'],
              message: `lever "${lever.id}" adds a line with unknown pricing mode "${line.mode}" (falls back to PAYG)`,
            });
          }
          if (!schedules.has(line.schedule)) {
            warnings.push({
              ...base,
              field: 'schedule',
              ref: line.schedule,
              path: [...linePath, 'schedule'],
              message: `lever "${lever.id}" adds a line with unknown schedule "${line.schedule}" (falls back to 24×7)`,
            });
          }
        });
      });
    });
  });

  return warnings;
}
