// Extracted out of `server.ts` (was a private helper there) so both the
// HTTP `GET /api/model` route and the `c4_get_model` MCP tool
// (`mcp-tools/get-model-tool.ts`) convert a loaded `C4Model` to its wire
// shape through the exact same function — a JSON-serialisation detail this
// package's two entry points must never independently reimplement.

import type { C4Model } from '@workspec/c4-model';

/**
 * Converts a loaded `C4Model` to a JSON-serialisable wire shape.
 * `C4Model.elements` is `Record<kind, ReadonlyMap<slug, LoadedElement>>` —
 * a `Map` value isn't JSON-serialisable as-is (`JSON.stringify` renders a
 * `Map` as `{}`) — so this flattens each kind's map into a plain object.
 * Every other field on `C4Model` is already plain data and passes through
 * unchanged.
 */
export function modelToWire(model: C4Model): unknown {
  return {
    elements: Object.fromEntries(
      Object.entries(model.elements).map(([kind, bySlug]) => [kind, Object.fromEntries(bySlug)]),
    ),
    diagrams: model.diagrams,
    spec: model.spec,
    diagnostics: model.diagnostics,
  };
}
