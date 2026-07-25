// Per-`DriftClass` display metadata: the human label, a one-line meaning
// (the drift panel's small caption next to each class chip), and the
// `@workspec/design` token accenting that class — ported from the
// authoritative design's `DRIFT_META` map (Topology Workbench (drift +
// cost).dc.html). Colour is deliberately not the only signal for a class —
// see `drift-glyph.tsx` for the per-class SHAPE every one of these renders
// alongside.

import { DRIFT_CLASSES } from '@workspec/topology-recon';
import type { DriftClass } from '@workspec/topology-recon';
import type { TokenName } from './themes.js';

/** One drift class's display metadata. */
export interface DriftClassMeta {
  /** Human-readable label, e.g. "Phantom". */
  readonly label: string;
  /** A short caption naming what the class means, e.g. "declared · absent in actual". */
  readonly meaning: string;
  /** The `@workspec/design` token accenting this class's chip/badge/glyph. */
  readonly token: TokenName;
}

/**
 * Display metadata for every real recon `DriftClass`, ported verbatim from
 * the design's `DRIFT_META` map. Token choices mirror the design's own CSS
 * variables one-for-one: `phantom` → `--type-persona`, `orphan` → `--warn`,
 * `divergent` → `--agent`, `miswired` → `--danger` (all real
 * `@workspec/design` tokens — see `themes.ts`).
 */
export const DRIFT_META: Record<DriftClass, DriftClassMeta> = {
  phantom: { label: 'Phantom', meaning: 'declared · absent in actual', token: '--type-persona' },
  orphan: { label: 'Orphan', meaning: 'in actual · never declared', token: '--warn' },
  divergent: { label: 'Divergent', meaning: 'config / cost differs', token: '--agent' },
  miswired: { label: 'Mis-wired', meaning: 'connected differently', token: '--danger' },
};

/** `var(--token)` CSS value accenting a drift class. */
export function driftColorVar(cls: DriftClass): string {
  return `var(${DRIFT_META[cls].token})`;
}

/** Every drift class, in the spec's normative order — re-exported so callers building a fixed-order UI (the drift panel's class list) don't need their own import of `@workspec/topology-recon`. */
export { DRIFT_CLASSES };
