/**
 * `@workspec/c4-layout`'s only entry: deterministic elkjs-based auto-layout
 * for `@workspec/c4-model`'s resolved diagrams, with pinned-node/mixed-mode
 * support and `.layout/` round-tripping. Pure computation over already-
 * loaded data — no filesystem, no DOM, no `node:` imports anywhere in this
 * graph — so this whole package (unlike c4-model's index/fs split) is
 * browser-safe as one entry.
 */
export { layoutDiagram } from './layout-diagram.js';
export { layoutModel } from './layout-model.js';
export { serialize } from './serialize.js';

export { C4_NODE_HEIGHT, C4_NODE_WIDTH } from './constants/node-size.js';

export type { LayoutDirection } from './model/layout-direction.js';
export type { LayoutDiagramInput, LayoutDiagramOptions } from './model/layout-diagram-input.types.js';
export type { PositionedDiagram, PositionedEdge, PositionedNode } from './model/positioned-diagram.types.js';
export type { LaidOutDiagram } from './model/laid-out-diagram.types.js';

export type { LayoutPoint } from './geometry/point.js';
export type { Rect } from './geometry/rect.js';
export { rectsOverlap } from './geometry/rects-overlap.js';
