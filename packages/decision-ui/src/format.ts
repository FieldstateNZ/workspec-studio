// Money formatting for the UI. Porting decision P8 lets the UI abbreviate, but
// we deliberately render **full, stable** numbers so the golden costs (e.g. App
// Service dev `$187.20`, AKS annual `$54,336.58`) are visible on screen exactly
// as the engine computes them. We reuse the engine's `formatMoney` — the same
// deterministic, locale-independent formatter that drives `render-adr` — so the
// on-screen numbers and the CI ADR artifact never diverge.

import { formatMoney } from '@workspec/decision-engine';

export { formatMoney };

/** Full formatted money, or an em dash for an incomplete / absent value. */
export function money(value: number | undefined, complete = true): string {
  if (!complete || value === undefined) return '—';
  return formatMoney(value);
}
