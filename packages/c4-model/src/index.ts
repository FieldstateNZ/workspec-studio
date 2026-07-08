/**
 * `@workspec/c4-model`'s browser-safe root entry: everything needed to load
 * a `C4Model` from an in-memory tree. Nothing here reaches into `node:fs`
 * or any other Node builtin — `FsSource` lives behind the `./fs` subpath
 * export (`import { createFsSource } from '@workspec/c4-model/fs'`) so this
 * entry stays loadable in a worker or browser context that has no `node:`
 * module resolution at all.
 */
export { loadC4Model } from './load-c4-model.js';

export type { C4FileSource } from './ports/c4-file-source.js';
export { createMemorySource } from './sources/memory-source.js';
export type { MemorySourceSeed } from './sources/memory-source.js';

export type { C4Model, C4ModelSpec } from './model/c4-model.types.js';
export { DIAGNOSTIC_CODES } from './model/diagnostic-codes.js';
export type { C4DiagnosticCode } from './model/diagnostic-codes.js';
export type { C4Diagnostic, C4DiagnosticSeverity } from './model/diagnostic.types.js';
export { ELEMENT_KINDS } from './model/element-kind.js';
export type { ElementKind } from './model/element-kind.js';
export type { ElementData, LoadedElement } from './model/element-data.types.js';
export type { ElementDisplayFields } from './model/element-display.js';
export type {
  LoadedLayoutInfo,
  ResolvedDiagram,
  ResolvedDiagramEdge,
  ResolvedDiagramNode,
  ResolvedDiagramView,
} from './model/diagram-resolution.types.js';
