// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Asserts the geometry/style sharing BY CONSTRUCTION (decision F, #120):
// `render-svg.ts` (the standalone string renderer) and `c4-diagram.tsx`
// (the interactive facade) must both build on the SHARED canvas modules —
// the `@workspec/canvas` orthogonal router and the in-package C4 layer's
// projection/style resolution (`./c4/`, folded from @workspec/canvas-c4 by
// ADR i) — so the two can never silently draw a
// diagram differently. A textual check rather than a runtime spy — it
// fails the moment either file stops using the shared modules, which is
// the point at which they COULD drift. Strengthened in S5 (#121) from
// import-string presence to CALL-SITE verification: imports and comments
// are stripped first, so a leftover `import { resolveConnectorGeometry }`
// (or a prose mention) with the actual call replaced by a local fork no
// longer satisfies the invariant — the identifier must be INVOKED (or,
// for the ConnectorLayer component, rendered) in executable code.

const here = fileURLToPath(new URL('.', import.meta.url));
const renderSvgSource = readFileSync(`${here}render-svg.ts`, 'utf8');
const canvasSource = readFileSync(`${here}c4-diagram.tsx`, 'utf8');

/**
 * The executable body of a source file: block/line comments and `import`
 * statements removed. Line-comment stripping here can be naive (unlike the
 * token audits' quote-aware stripper) because the assertions below only
 * LOOK FOR presence — a `//` inside a string can only delete code, which
 * would turn a true positive into a test failure, never mask a violation.
 */
function executableBody(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const cut = line.indexOf('//');
      return cut === -1 ? line : line.slice(0, cut);
    })
    .filter((line) => !/^\s*import[\s{]/.test(line) && !/^\s*} from '/.test(line))
    .join('\n');
}

const renderSvgBody = executableBody(renderSvgSource);
const canvasBody = executableBody(canvasSource);

describe('render-svg.ts and c4-diagram.tsx share the canvas geometry/style modules', () => {
  it.each(["from '@workspec/canvas'", "from './c4/index.js'"])('both import %s', (spec) => {
    expect(renderSvgSource).toContain(spec);
    expect(canvasSource).toContain(spec);
  });

  it('render-svg CALLS the shared router + elbow path + projection', () => {
    expect(renderSvgBody).toMatch(/resolveConnectorGeometry\s*\(/);
    expect(renderSvgBody).toMatch(/roundedConnectorPath\s*\(/);
    expect(renderSvgBody).toMatch(/buildC4Shapes\s*\(/);
  });

  it('the facade RENDERS the shared ConnectorLayer and CALLS the projection (same router at runtime)', () => {
    expect(canvasBody).toMatch(/<ConnectorLayer\s+layer=["']geometry["']\s*\/?>/);
    expect(canvasBody).toMatch(/<ConnectorLayer\s+layer=["']labels["']\s*\/?>/);
    expect(canvasBody).toMatch(/buildC4Shapes\s*\(/);
  });

  it('both resolve styles through the one canonical spec-defaults module', () => {
    // render-svg via the local re-export; the facade via a buildCanvasSpec call.
    expect(renderSvgSource).toContain('./style/spec-defaults.js');
    expect(canvasBody).toMatch(/buildCanvasSpec\s*\(/);
  });

  it('sanity: the import/comment stripper leaves call sites and removes import clauses', () => {
    const stripped = executableBody(
      "import { a } from 'x';\nimport {\n  b,\n} from 'y';\n// a(1) in prose\nconst r = a(b);\n",
    );
    expect(stripped).not.toContain("from 'x'");
    expect(stripped).not.toContain("from 'y'");
    expect(stripped).toMatch(/a\s*\(/);
    expect(stripped).not.toContain('prose');
  });
});
