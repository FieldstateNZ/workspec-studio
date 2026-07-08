// Builds the `.layout/` file content to write after a drag-to-pin edit.
// `@workspec/c4-layout`'s `serialize()` turns ONE positioned view into a
// `Layout` — but a `c4-container` diagram's two lenses (logical/deployment)
// share a SINGLE `.layout/` file (`layoutModel` reads the same
// `diagram.layout?.data` for both). Serializing only the lens currently on
// screen and writing it verbatim would silently drop the OTHER lens's
// pinned nodes/edges from the shared file. This merges the current lens's
// serialized nodes/edges into whatever the diagram's existing `.layout/`
// data already had (keys the current lens doesn't touch pass through
// unchanged), so drag-to-pin in one lens never clobbers the other's pins.
// One code path regardless of diagram type: a non-container diagram's
// "existing data" is just its own prior state, so the merge is a no-op
// beyond incorporating the new drag.

import { serialize } from '@workspec/c4-layout';
import type { PositionedDiagram } from '@workspec/c4-layout';
import { Layout } from '@workspec/c4-schema';
import type { Layout as LayoutData } from '@workspec/c4-schema';

/** Merges one lens's freshly positioned view into the diagram's existing `.layout/` data, for a drag-to-pin write. */
export function serializeForWrite(
  existing: LayoutData | null,
  positioned: PositionedDiagram,
): LayoutData {
  const incoming = serialize(positioned);
  return Layout.parse({
    version: 1,
    nodes: { ...(existing?.nodes ?? {}), ...incoming.nodes },
    edges: { ...(existing?.edges ?? {}), ...incoming.edges },
    ...(existing?.viewport ? { viewport: existing.viewport } : {}),
  });
}
