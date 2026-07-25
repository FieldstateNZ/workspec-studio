// Internal barrel for the JSON-guard helpers shared across all three
// adapters. Not part of the package's public surface (not re-exported from
// `src/index.ts`) — these are implementation details of turning
// already-parsed, unknown-shaped vendor JSON into typed reads.

export { isRecord } from './is-record.js';
export { asRecord } from './as-record.js';
export { asString } from './as-string.js';
export { asArray } from './as-array.js';
export { asNumber } from './as-number.js';
export { stringArray } from './string-array.js';
