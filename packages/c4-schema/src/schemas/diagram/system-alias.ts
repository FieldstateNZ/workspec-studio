/**
 * Alias usable as a diagram node/edge slug in place of the active
 * project's system slug. Lets a diagram reference "the system" without
 * hard-coding which system file that resolves to — resolution is out of
 * scope for this package (see S3, the loader/resolution slice).
 */
export const SYSTEM_ALIAS = '__system__';
