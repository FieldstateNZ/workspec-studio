import { z } from 'zod';

// Shared Zod primitives used across the catalog and decision artifacts.

/**
 * A machine identifier: a slug of letters, digits, underscore or hyphen,
 * starting with a letter or digit. Used for artifact/entity ids and for the
 * ref keys that tie lines to catalog SKUs, modes, schedules and environments.
 */
export const identifier = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'must be a slug: a letter or digit followed by letters, digits, "_" or "-"',
  );
