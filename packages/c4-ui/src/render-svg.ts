// Standalone, deterministic SVG rendering — no React runtime in the output.
// Since S4 (#120, decision F) the EDGES come from the same shared geometry
// the interactive canvas renders with: `@workspec/canvas`'s orthogonal
// router (`resolveConnectorGeometry`) + rounded elbow path
// (`roundedConnectorPath`) over the C4 layer's projection (`./c4/`'s
// `buildC4Shapes` — lane offsets, fan roles, obstacle avoidance included),
// so the CLI `render` output, docs SVGs and the `c4_render` MCP tool carry
// the enterprise edge look by construction —
// `render-svg.shared-modules.test.ts` asserts the sharing. Node cards stay
// SVG-string generated here (a standalone SVG can't host the React card),
// with colours computed via the same shared `--el-tint-*` derivation
// (style/element-tints.ts + style/color-mix.ts) the CSS layer encodes.

import type { PositionedDiagram, PositionedNode } from '@workspec/c4-layout';
import type { Diagram, Spec } from '@workspec/c4-schema';
import type { ResolvedDiagram } from '@workspec/c4-model';
import {
  resolveConnectorGeometry,
  roundedConnectorPath,
} from '@workspec/canvas';
import type { ConnectorShape, Shape, ShapeId } from '@workspec/canvas';
import { buildC4Shapes, edgeShapeId } from './c4/index.js';
import { contentBounds } from './geometry/content-bounds.js';
import type { Rect } from './geometry/node-shape.js';
import { nodeShapeGeometry } from './geometry/node-shape.js';
import { truncateLabel } from './geometry/truncate-label.js';
import { THEMES } from './themes.js';
import type { ThemeName, TokenName } from './themes.js';
import { WHITE, formatHex, formatRgba, mixOklab, parseCssColor } from './style/color-mix.js';
import { elementTintsFor } from './style/element-tints.js';
import { resolveConnectionStyle, resolveElementStyle } from './style/spec-defaults.js';

export interface RenderSvgOptions {
  /** The loaded style spec, if any — accent/shape/variant overrides. Omit to render with the Enterprise defaults. */
  spec?: Spec;
  /** Which theme's tokens to embed as literal (resolved) values — a standalone SVG has no CSS custom property scope of its own. Defaults to `'light'`. */
  theme?: ThemeName;
  /** A title for accessibility/document metadata. Defaults to `'C4 diagram'`. */
  title?: string;
}

// SECURITY (CodeQL js/html-constructed-from-input alerts #1–#3, triaged
// S4 #120): every USER-INFLUENCED value interpolated into this SVG string
// must pass through escapeXml — text nodes AND attribute values. Numbers
// are typed numeric. The one free-string styling input is the spec.yaml
// accent (`z.string()`, unconstrained by @workspec/c4-schema), so accent
// interpolations below are escaped too; see render-svg.test.ts's
// hostile-accent regression.
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rectOf(node: PositionedNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

/** One node's fully computed colour set — the code equivalent of styles.css's `.c4-node` custom-property layer. */
interface NodePalette {
  readonly accent: string;
  readonly surface: string;
  readonly border: string;
  readonly eyebrow: string;
  readonly inkDim: string;
  readonly ink: string;
}

/**
 * Computes a node's palette per the shared "typed element" derivation
 * (`elementTintsFor`): lift the accent toward white in dark, tint the
 * elevated surface with it, alpha it for the border, mix it into ink for the
 * eyebrow. An accent this module can't parse (an exotic authored spec.yaml
 * value — see style/color-mix.ts) falls back to flat theme surfaces with the
 * raw accent string passed through for the identity stripe, documented in
 * docs/c4/drift-log.md entry 14.
 */
function nodePaletteFor(
  rawAccent: string,
  theme: ThemeName,
  tokens: Readonly<Record<TokenName, string>>,
): NodePalette {
  const tints = elementTintsFor(theme, tokens);
  const accentRgb = parseCssColor(rawAccent, tokens);
  const bgRgb = parseCssColor(tokens['--bg-elevated'], tokens);
  const inkRgb = parseCssColor(tokens['--ink'], tokens);

  if (!accentRgb || !bgRgb || !inkRgb) {
    return {
      accent: rawAccent,
      surface: tokens['--bg-elevated'],
      border: tokens['--line'],
      eyebrow: tokens['--ink-fade'],
      inkDim: tokens['--ink-soft'],
      ink: tokens['--ink'],
    };
  }

  const lifted =
    tints.accentLiftPct > 0
      ? mixOklab(accentRgb, WHITE, (100 - tints.accentLiftPct) / 100)
      : accentRgb;
  const eyebrowRgb =
    tints.eyebrowPct === 100 ? lifted : mixOklab(lifted, inkRgb, tints.eyebrowPct / 100);

  return {
    accent: formatHex(lifted),
    surface: formatHex(mixOklab(lifted, bgRgb, tints.surfacePct / 100)),
    border: formatRgba(lifted, tints.borderPct / 100),
    eyebrow: formatHex(eyebrowRgb),
    inkDim: formatRgba(inkRgb, tints.inkDimPct / 100),
    ink: tokens['--ink'],
  };
}

function renderNode(
  node: PositionedNode,
  spec: Spec | undefined,
  theme: ThemeName,
  tokens: Readonly<Record<TokenName, string>>,
): string {
  const style = resolveElementStyle(node.kind, spec);
  const shape = nodeShapeGeometry(rectOf(node), style.shape);
  const raw = nodePaletteFor(style.accent, theme, tokens);
  const palette = {
    accent: escapeXml(raw.accent),
    surface: escapeXml(raw.surface),
    border: escapeXml(raw.border),
    eyebrow: escapeXml(raw.eyebrow),
    inkDim: escapeXml(raw.inkDim),
    ink: escapeXml(raw.ink),
  };
  const stripeDash = style.variant === 'external' ? ' stroke-dasharray="6 3"' : '';

  const parts: string[] = [];
  parts.push(`<g aria-label="${escapeXml(`${node.kind ?? 'element'}: ${node.title}`)}">`);
  if (shape.kind === 'rect') {
    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${shape.rx}" ry="${shape.ry}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1"/>`,
    );
  } else {
    parts.push(
      `<path d="${shape.outline}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1"/>`,
    );
    if (shape.decoration !== undefined) {
      parts.push(
        `<path d="${shape.decoration}" fill="none" stroke="${palette.border}" stroke-width="1"/>`,
      );
    }
  }
  // The 4px accent identity stripe — a line so the external variant's dash
  // renders, mirroring the canvas (and Enterprise's dashed borderLeft).
  parts.push(
    `<line x1="${node.x + 2}" y1="${node.y}" x2="${node.x + 2}" y2="${node.y + node.height}" stroke="${palette.accent}" stroke-width="4"${stripeDash}/>`,
  );
  parts.push(
    `<text x="${node.x + 14}" y="${node.y + 26}" font-size="14" font-weight="600" fill="${palette.ink}">${escapeXml(truncateLabel(node.title, 26))}</text>`,
  );
  if (node.description !== null && node.description !== '') {
    parts.push(
      `<text x="${node.x + 14}" y="${node.y + 50}" font-size="11" fill="${palette.inkDim}">${escapeXml(truncateLabel(node.description, 34))}</text>`,
    );
  }
  if (node.technology !== null && node.technology !== '') {
    parts.push(
      `<text x="${node.x + 14}" y="${node.y + node.height - 12}" font-size="10" fill="${palette.inkDim}">${escapeXml(truncateLabel(node.technology, 30))}</text>`,
    );
  }
  if (node.kind !== null) {
    parts.push(
      `<text x="${node.x + node.width - 10}" y="${node.y + node.height - 12}" font-size="10" text-anchor="end" fill="${palette.eyebrow}">${escapeXml(node.kind)}</text>`,
    );
  }
  parts.push('</g>');
  return parts.join('');
}

// The enterprise elbow radius (ConnectorLayer's CORNER_RADIUS at 1× zoom)
// and arrowhead (`M -8 -4 L 0 0 L -8 4 Z`, rotated into the target face).
const EDGE_CORNER_RADIUS = 12;

interface RoutedEdgeIn {
  from: string;
  to: string;
  label: string | null;
  category: string | null;
}

/**
 * Resolves one edge accent to a LITERAL colour (S4 fix round, #120): a
 * standalone SVG has no CSS custom-property scope, so a `var(--ink-fade)`
 * stroke (the UNKNOWN_CONNECTION_STYLE default for uncategorized edges)
 * falls back to `none` in every standalone consumer — 29 invisible edges
 * in the committed container dogfood SVG. Edges now go through the SAME
 * parse machinery node accents already use (`parseCssColor` over the
 * theme token map); an accent this module can't parse (an exotic authored
 * spec.yaml value) falls back to the theme's resolved `--ink-fade`
 * literal rather than passing the raw string through — an edge stroke,
 * unlike the node identity stripe, must never emit `var(`.
 */
function edgeAccentLiteral(
  rawAccent: string,
  tokens: Readonly<Record<TokenName, string>>,
): string {
  const rgb = parseCssColor(rawAccent, tokens);
  if (rgb) return formatHex(rgb);
  const fallback = parseCssColor(tokens['--ink-fade'], tokens);
  return fallback ? formatHex(fallback) : tokens['--ink-fade'];
}

function renderRoutedEdge(
  edge: RoutedEdgeIn,
  shapes: Record<ShapeId, Shape>,
  spec: Spec | undefined,
  tokens: Readonly<Record<TokenName, string>>,
): string {
  const connector = shapes[edgeShapeId(edge.from, edge.to)] as ConnectorShape | undefined;
  if (!connector) return '';
  const geom = resolveConnectorGeometry(connector, shapes);
  if (!geom) return '';
  const style = resolveConnectionStyle(edge.category, spec);
  const d = roundedConnectorPath([...geom.points], EDGE_CORNER_RADIUS);
  const dash = style.style === 'dashed' ? ' stroke-dasharray="6 5"' : '';
  const parts: string[] = [];
  const label = `${edge.from} to ${edge.to}${edge.label ? `: ${edge.label}` : ''}`;
  parts.push(`<g aria-label="${escapeXml(label)}">`);
  const accent = escapeXml(edgeAccentLiteral(style.accent, tokens));
  parts.push(
    `<path d="${d}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
  );
  parts.push(
    `<path d="M -8 -4 L 0 0 L -8 4 Z" fill="${accent}" transform="translate(${geom.arrow.x} ${geom.arrow.y}) rotate(${geom.arrow.angle})"/>`,
  );
  if (edge.label !== null) {
    parts.push(
      `<text x="${geom.label.x}" y="${geom.label.y - 4}" font-size="11" text-anchor="middle">${escapeXml(truncateLabel(edge.label, 28))}</text>`,
    );
  }
  parts.push('</g>');
  return parts.join('');
}

/**
 * Renders a positioned diagram as a standalone, self-contained SVG document
 * string: no React runtime, no external stylesheet — every colour is
 * resolved to a literal value from the requested theme's tokens (or a
 * `spec.yaml`/Enterprise-default accent). Deterministic: identical input
 * (including `options`) always produces byte-identical output.
 */
export function renderSvg(diagram: PositionedDiagram, options: RenderSvgOptions = {}): string {
  const theme = options.theme ?? 'light';
  const tokens = THEMES[theme];
  const bounds = contentBounds(diagram.nodes.map(rectOf));
  const title = options.title ?? 'C4 diagram';

  // Project through the shared C4 pipeline so edge routing (faces, lane
  // offsets, fan roles, obstacle detours) is EXACTLY what the interactive
  // canvas draws. Deterministic: geometry never reads the (jittered)
  // z-order indices, and render order below follows the input arrays.
  const synthetic: ResolvedDiagram = {
    slug: 'render',
    path: '',
    title,
    type: 'c4-context',
    description: null,
    raw: {} as Diagram,
    view: { nodes: diagram.nodes, edges: diagram.edges },
    lensViews: null,
    layout: null,
  };
  // Placements include the laid-out width/height so pinned-size nodes'
  // edges route against the REAL card rects, not a default-size phantom
  // (S4 fix round — a discarded pin size detached edges from card faces).
  const projection = buildC4Shapes(synthetic, {
    positions: Object.fromEntries(
      diagram.nodes.map(
        (n) => [n.nodeId, { x: n.x, y: n.y, width: n.width, height: n.height }] as const,
      ),
    ),
  });

  const edgesSvg = diagram.edges
    .map((edge) =>
      renderRoutedEdge(
        { from: edge.from, to: edge.to, label: edge.label, category: edge.category },
        projection.shapes,
        options.spec,
        tokens,
      ),
    )
    .join('');
  const nodesSvg = diagram.nodes
    .map((node) => renderNode(node, options.spec, theme, tokens))
    .join('');
  const canvasBg = tokens['--canvas-bg'];

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" ` +
    `role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${canvasBg}"/>` +
    `<g>${edgesSvg}</g>` +
    `<g>${nodesSvg}</g>` +
    `</svg>`
  );
}
