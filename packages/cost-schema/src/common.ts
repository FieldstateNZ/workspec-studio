import { z } from 'zod';

// Shared Zod primitives used across the four cost artifact kinds.

/**
 * A machine identifier: a slug of letters, digits, underscore or hyphen,
 * starting with a letter or digit. Used for artifact ids, dimension ids, rule
 * ids, and the value ids a rule's effects reference.
 */
export const identifier = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'must be a slug: a letter or digit followed by letters, digits, "_" or "-"',
  );

// Azure tag naming rules (used by Inventory resource tags and TagPlan tag
// names): a tag NAME is at most 512 characters and must not contain
// `< > % & \ ? /`. A tag VALUE is at most 256 characters with no character
// restriction — split-serialized values like "workspec:60|atrium:40" (`:`
// and `|`) are valid tag values.

const AZURE_TAG_NAME_PATTERN = /^[^<>%&\\?/]*$/;

/** An Azure-style resource tag name: 1-512 chars, must not contain `< > % & \ ? /`. */
export const resourceTagName = z
  .string()
  .min(1)
  .max(512)
  .regex(AZURE_TAG_NAME_PATTERN, 'must not contain < > % & \\ ? /')
  .describe('A resource tag name: 1-512 characters, must not contain < > % & \\ ? / (Azure rule).');

/** An Azure-style resource tag value: at most 256 chars, no character restriction. */
export const resourceTagValue = z
  .string()
  .max(256)
  .describe('A resource tag value: at most 256 characters. No character restriction.');
