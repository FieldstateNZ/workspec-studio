import { ARTIFACT_KINDS } from '@workspec/c4-schema';
import { z } from 'zod';

/**
 * Zod field for a client-supplied element kind: the nine `ARTIFACT_KINDS`
 * minus `diagram` — the same subtraction `@workspec/c4-model`'s
 * `ELEMENT_KINDS` makes (diagrams are mutated through the relation routes
 * and are never element files). Deriving via `.exclude` keeps this field
 * from ever drifting when a kind is added upstream.
 */
export const elementKindField = z.enum(ARTIFACT_KINDS).exclude(['diagram']);
