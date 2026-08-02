// Enterprise C4 STATUS colours — with `spec-defaults.ts` and
// `local-tokens.css`, one of this package's three documented exceptions to
// the zero-local-tokens rule (`token-audit.test.ts` allow-lists exactly
// these files). All three values are enterprise conformance constants with
// no design-token analog; parity CSS must not drift, so they stay literal:

/**
 * Brand orange for the rework halo, chip, and toggle footer text
 * (enterprise `C4NodeComponent.REWORKING_COLOUR`, theme-invariant).
 */
export const REWORKING_COLOUR = '#d8643f';

/** The rework halo's faint fill — the reworking orange at 3% (enterprise literal). */
export const REWORKING_HALO_BG = 'rgba(216,100,63,0.03)';

/**
 * The validity marker's "valid" green (enterprise Tailwind `text-emerald-500`).
 * The design system's `--accent` is a DIFFERENT green (brand), so this stays
 * the enterprise emerald literal.
 */
export const VALID_GREEN = '#10b981';
