// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Asserts the geometry/style sharing BY CONSTRUCTION: `render-svg.ts` (the
// standalone string renderer) and `c4-diagram.tsx` (the interactive canvas)
// must import the exact same geometry/style modules for node shape, edge
// routing, and colour resolution, so the two can never silently draw a
// diagram differently. A textual import-statement check rather than a
// runtime spy: it fails the moment either file stops importing one of these
// modules, which is the point at which they COULD drift.

const here = fileURLToPath(new URL('.', import.meta.url));
const renderSvgSource = readFileSync(`${here}render-svg.ts`, 'utf8');
const canvasSource = readFileSync(`${here}c4-diagram.tsx`, 'utf8');

const SHARED_MODULES = [
  './geometry/node-shape.js',
  './geometry/edge-path.js',
  './geometry/content-bounds.js',
  './geometry/truncate-label.js',
  './style/spec-defaults.js',
  './style/marker-id.js',
];

describe('render-svg.ts and c4-diagram.tsx share their geometry/style modules', () => {
  it.each(SHARED_MODULES)('both import %s', (modulePath) => {
    expect(renderSvgSource).toContain(modulePath);
    expect(canvasSource).toContain(modulePath);
  });
});
