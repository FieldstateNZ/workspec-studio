/**
 * The `./fs` subpath entry: `node:fs/promises`-backed
 * {@link TopologyFileSource}. Kept out of the package root so importing
 * `@workspec/topology-model` never pulls in a `node:` specifier — only
 * reachable via `import { createFsSource } from '@workspec/topology-model/fs'`.
 */
export { createFsSource } from './sources/fs-source.js';
export type { TopologyFileSource } from './ports/topology-file-source.js';
