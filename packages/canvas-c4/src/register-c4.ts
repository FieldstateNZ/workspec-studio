import type { CanvasSpec, CanvasStoreInstance } from '@workspec/canvas';
import { createConnectorShapeUtil } from '@workspec/canvas';
import type { Spec } from '@workspec/c4-schema';
import { c4NodeShapeUtil } from './shapes/c4-node-shape-util.js';
import { c4BoundaryShapeUtil } from './shapes/c4-boundary-shape-util.js';
import {
  DEFAULT_CONNECTION_STYLES,
  DEFAULT_ELEMENT_STYLES,
  resolveConnectionStyle,
  resolveElementStyle,
} from './style/spec-defaults.js';

/**
 * Register the C4 shape modules on a canvas instance (#119): the c4node
 * card, the c4boundary panel, and — when absent — the instance-scoped
 * connector util the edges render through. Idempotent per instance.
 */
export function registerC4(instance: CanvasStoreInstance): void {
  instance.shapeUtils.register(c4NodeShapeUtil);
  instance.shapeUtils.register(c4BoundaryShapeUtil);
  if (!instance.shapeUtils.get('connector')) {
    instance.shapeUtils.register(createConnectorShapeUtil(instance));
  }
}

/**
 * Compile a `spec.yaml` (or nothing) into the engine's CanvasSpecContext
 * shape: every known default kind/category plus any spec-only extras, each
 * resolved through the reconciled default tables (style/spec-defaults.ts).
 * Feed the result to `<CanvasSpecContext.Provider>` so the node cards and
 * connector layer pick up authored overrides.
 */
export function buildCanvasSpec(spec: Spec | undefined): CanvasSpec {
  const elementKinds = new Set([
    ...Object.keys(DEFAULT_ELEMENT_STYLES),
    ...(spec ? Object.keys(spec.elements) : []),
  ]);
  const connectionCategories = new Set([
    ...Object.keys(DEFAULT_CONNECTION_STYLES),
    ...(spec ? Object.keys(spec.connections) : []),
  ]);

  const elements: CanvasSpec['elements'] = {};
  for (const kind of elementKinds) {
    const style = resolveElementStyle(kind, spec);
    elements[kind] = {
      accent: style.accent,
      icon: style.icon,
      shape: style.shape,
      variant: style.variant,
    };
  }
  const connections: CanvasSpec['connections'] = {};
  for (const category of connectionCategories) {
    const style = resolveConnectionStyle(category, spec);
    connections[category] = { accent: style.accent, style: style.style };
  }
  return { elements, connections };
}
