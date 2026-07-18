/**
 * Root directory of a WorkSpec working tree, relative to the repository
 * root. Every artifact family (C4 elements, decisions, cost artifacts,
 * traceability requirements, etc.) lives under this one directory. Same
 * shape/value as `@workspec/c4-schema`'s `WORKSPEC_DIR` — copied rather than
 * imported so this package has zero `@workspec` dependencies.
 */
export const WORKSPEC_DIR = '.workspec';
