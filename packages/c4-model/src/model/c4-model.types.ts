import type { Spec } from '@workspec/c4-schema';
import type { C4Diagnostic } from './diagnostic.types.js';
import type { ResolvedDiagram } from './diagram-resolution.types.js';
import type { LoadedElement } from './element-data.types.js';
import type { ElementKind } from './element-kind.js';

/** The style spec: the parsed `spec.yaml` if present, or `path: null` alongside `@workspec/c4-schema`'s code defaults. */
export interface C4ModelSpec {
  readonly path: string | null;
  readonly data: Spec;
}

/**
 * The output of `loadC4Model`: every element (by kind), every diagram
 * (resolved, with its `.layout/` file joined if present), the style spec,
 * and every diagnostic found along the way. Always resolves — a tree with
 * errors still produces a data-complete `C4Model`, so callers decide what
 * to do with the diagnostics (fail a CI check, render inline in an editor,
 * ignore warnings, etc.) rather than this package deciding for them.
 */
export interface C4Model {
  readonly elements: Record<ElementKind, ReadonlyMap<string, LoadedElement>>;
  readonly diagrams: readonly ResolvedDiagram[];
  readonly spec: C4ModelSpec;
  readonly diagnostics: readonly C4Diagnostic[];
}
