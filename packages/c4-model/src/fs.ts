/**
 * The `./fs` subpath entry: `node:fs/promises`-backed {@link C4FileSource}.
 * Kept out of the package root so importing `@workspec/c4-model` never
 * pulls in a `node:` specifier — only reachable via
 * `import { createFsSource } from '@workspec/c4-model/fs'`.
 */
export { createFsSource } from './sources/fs-source.js';
export { RefEscapesRootError } from './sources/path-containment.js';
export type { C4FileSource } from './ports/c4-file-source.js';
