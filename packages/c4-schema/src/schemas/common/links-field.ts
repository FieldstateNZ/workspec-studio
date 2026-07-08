import { z } from 'zod';
import { LinkCardinality } from './link-cardinality.js';
import { PATH_REF_PATTERN } from './path-ref-pattern.js';

const linkEntry = z
  .record(
    z.string().describe('The link type, e.g. "adr", "runbook" — or "cardinality" for the optional cardinality key.'),
    z.unknown(),
  )
  .superRefine((entry, ctx) => {
    const linkKeys = Object.keys(entry).filter((key) => key !== 'cardinality');
    if (linkKeys.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'each links entry must have exactly one {linkType: pathRef} pair',
      });
      return;
    }
    const linkType = linkKeys[0] as string;
    const ref = entry[linkType];
    if (typeof ref !== 'string') {
      ctx.addIssue({
        code: 'custom',
        message: `links entry "${linkType}" must be a string pathRef`,
      });
      return;
    }
    if (!PATH_REF_PATTERN.test(ref)) {
      ctx.addIssue({
        code: 'custom',
        message: 'cross-references must start with ~/ or @workspace/ (bare paths and uuids are not allowed)',
      });
      return;
    }
    if ('cardinality' in entry) {
      const parsed = LinkCardinality.safeParse(entry.cardinality);
      if (!parsed.success) {
        ctx.addIssue({
          code: 'custom',
          message: `invalid cardinality on link entry "${linkType}": ${parsed.error.message}`,
        });
      }
    }
  });

/**
 * Shared `links` field carried by every C4 element: an array of entries,
 * each holding exactly one `{<linkType>: <pathRef>}` pair, optionally with a
 * `cardinality` key (`{from, to, label?}`) on the same entry for
 * relationship-style links such as `entity-relates-to-entity`. Optional —
 * most elements have none. Mirrors Enterprise's `linkEntrySchema` /
 * `linksField` in `lib/yaml-schemas/src/common.ts`, including the
 * superRefine-based entry validation — which JSON Schema cannot express, so
 * editors won't flag a malformed entry shape; runtime Zod validation will.
 */
export const linksField = z
  .array(linkEntry)
  .optional()
  .describe(
    'Cross-references to other artifacts or docs: exactly one {<linkType>: <pathRef>} pair per entry, plus an optional cardinality key ({from, to, label?}). Path refs must start with "~/" or "@workspace/".',
  );

/** Inferred type of the shared `links` field. */
export type LinksField = z.infer<typeof linksField>;
