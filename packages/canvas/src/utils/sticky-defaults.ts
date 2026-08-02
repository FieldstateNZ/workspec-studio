import type { StickyColor } from '../shape-types.js';

export type { StickyColor };

/** The sticky-note defaults remembered across sessions (per browser). */
export interface StickyDefaults {
  color: StickyColor;
  fontFamily: string;
}

const KEY = 'workspec-sticky-defaults';

const FALLBACK: StickyDefaults = {
  color: 'yellow',
  fontFamily: 'var(--sans)',
};

/**
 * The last sticky colour/font the user picked, falling back to yellow +
 * the host sans font. Reads localStorage defensively — storage errors and
 * malformed payloads fall back silently (matching the enterprise
 * behaviour; sticky defaults are cosmetic, never load-bearing).
 */
export function getStickyDefaults(): StickyDefaults {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...FALLBACK, ...(JSON.parse(raw) as Partial<StickyDefaults>) };
  } catch {
    /* ignore */
  }
  return { ...FALLBACK };
}

/** Persist a partial update to the remembered sticky defaults (best-effort). */
export function setStickyDefaults(patch: Partial<StickyDefaults>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getStickyDefaults(), ...patch }));
  } catch {
    /* ignore */
  }
}
