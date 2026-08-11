import { SYSTEM_ALIAS } from '@workspec/c4-schema';
import { z } from 'zod';
import { slugField } from './slug-field.js';

/**
 * Zod field for a relation endpoint: an element slug, or the `__system__`
 * alias — the one non-slug token diagram edges may legitimately name (the
 * representative trees author `to: __system__` routinely, and the resolver
 * substitutes the active system for it). Kept separate from `slugField`
 * because element routes must NEVER accept the alias: `__system__` is not
 * a file.
 */
export const relationEndpointField = z.union([slugField, z.literal(SYSTEM_ALIAS)]);
