import type { Shape } from './types.js';

/**
 * Maps a shape to the semantic kind it filters under for per-kind
 * visibility (`hiddenKinds` in the store) and kind-coloured chrome (e.g.
 * the minimap, S2). The enterprise canvas hard-coded this mapping for its
 * artifact-backed shapes (`kindOfShape` in utils/containers.ts); in the
 * package it is an injected seam (`CanvasStoreOptions.kindResolver`, per
 * issue #117) so hosts with artifact- or model-backed shapes can filter by
 * their own taxonomy without the engine knowing it.
 */
export type KindResolver = (shape: Shape) => string;

/** The default resolver: every shape filters under its own `type`. */
export const defaultKindResolver: KindResolver = (shape) => shape.type;
