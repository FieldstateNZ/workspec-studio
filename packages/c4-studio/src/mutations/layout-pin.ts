import { layoutPathFor, parseLayoutYaml, serializeLayout } from '@workspec/c4-schema';
import type { Layout } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';

/**
 * Pins one node's position in a diagram's `.layout/` file, creating the
 * file (`{version: 1, nodes: {...}}`) when absent. Positions always land
 * in the `.layout/` sibling rather than inline on the diagram node: it is
 * the position mechanism the studio already writes (drag-to-pin), it works
 * identically for thin and fat diagrams (fat nodes cannot carry an inline
 * `position` at all), and it keeps position churn out of the authored
 * diagram file's git history.
 *
 * Best-effort by design: an existing `.layout/` file that fails
 * `parseLayoutYaml` is left untouched (the model loader already surfaces
 * it as a diagnostic; clobbering a human's broken-but-recoverable file to
 * record a pin would be worse than skipping the pin). Layout files are
 * machine-rewritten wholesale (`serializeLayout`), matching the existing
 * drag-to-pin `PUT /api/file` path.
 */
export async function upsertLayoutPin(
  source: C4FileSource,
  diagramSlug: string,
  nodeRef: string,
  position: { readonly x: number; readonly y: number },
): Promise<void> {
  const path = layoutPathFor(diagramSlug);
  let layout: Layout = { version: 1, nodes: {} };
  if (await source.exists(path)) {
    const parsed = parseLayoutYaml(await source.readFile(path));
    if (!parsed.ok) return;
    layout = parsed.data;
  }
  layout = { ...layout, nodes: { ...layout.nodes, [nodeRef]: { x: position.x, y: position.y } } };
  await source.writeFile(path, serializeLayout(layout));
}
