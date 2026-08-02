// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Asserts the geometry/style sharing BY CONSTRUCTION (decision F, #120):
// `render-svg.ts` (the standalone string renderer) and `c4-diagram.tsx`
// (the interactive facade) must both build on the SHARED canvas packages —
// the `@workspec/canvas` orthogonal router and the `@workspec/canvas-c4`
// projection/style resolution — so the two can never silently draw a
// diagram differently. A textual import check rather than a runtime spy:
// it fails the moment either file stops importing the shared modules,
// which is the point at which they COULD drift.

const here = fileURLToPath(new URL('.', import.meta.url));
const renderSvgSource = readFileSync(`${here}render-svg.ts`, 'utf8');
const canvasSource = readFileSync(`${here}c4-diagram.tsx`, 'utf8');

describe('render-svg.ts and c4-diagram.tsx share the canvas geometry/style packages', () => {
  it.each(['@workspec/canvas', '@workspec/canvas-c4'])('both import %s', (pkg) => {
    expect(renderSvgSource).toContain(`from '${pkg}'`);
    expect(canvasSource).toContain(`from '${pkg}'`);
  });

  it('render-svg routes edges through the SHARED router + elbow path', () => {
    expect(renderSvgSource).toContain('resolveConnectorGeometry');
    expect(renderSvgSource).toContain('roundedConnectorPath');
    expect(renderSvgSource).toContain('buildC4Shapes');
  });

  it('the facade renders edges through the shared ConnectorLayer (same router at runtime)', () => {
    expect(canvasSource).toContain('ConnectorLayer');
    expect(canvasSource).toContain('buildC4Shapes');
  });

  it('both resolve styles through the one canonical spec-defaults module', () => {
    // render-svg via the local re-export; the facade via buildCanvasSpec.
    expect(renderSvgSource).toContain("./style/spec-defaults.js");
    expect(canvasSource).toContain('buildCanvasSpec');
  });
});
