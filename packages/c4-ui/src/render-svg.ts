// Standalone, deterministic SVG rendering — no React runtime in the output.
// Built from the SAME geometry/style modules `c4-diagram.tsx` uses
// (`geometry/node-shape.ts`, `geometry/edge-path.ts`, `geometry/content-bounds.ts`,
// `style/spec-defaults.ts`, `style/marker-id.ts`) so the two renderers cannot
// draw a diagram differently — see `render-svg.shared-modules.test.ts`, which
// asserts both this file and `c4-diagram.tsx` import each of those modules.
// Node colours follow the same Enterprise `.c4-el` accent derivation the
// canvas gets from styles.css's color-mix layer, computed in code here
// (style/color-mix.ts over style/element-tints.ts — same percentages,
// asserted in sync by element-tints.test.ts) because a standalone SVG's
// attributes cannot use CSS `color-mix()`.

import type { PositionedDiagram, PositionedEdge, PositionedNode } from '@workspec/c4-layout';
import type { Spec } from '@workspec/c4-schema';
import { contentBounds } from './geometry/content-bounds.js';
import { orthogonalEdgePath, routeMidpoint } from './geometry/edge-path.js';
import type { Rect } from './geometry/node-shape.js';
import { nodeShapeGeometry } from './geometry/node-shape.js';
import { truncateLabel } from './geometry/truncate-label.js';
import { THEMES } from './themes.js';
import type { ThemeName, TokenName } from './themes.js';
import { WHITE, formatHex, formatRgba, mixOklab, parseCssColor } from './style/color-mix.js';
import { ELEMENT_TINTS } from './style/element-tints.js';
import { markerIdFor, uniqueAccents } from './style/marker-id.js';
import { resolveConnectionStyle, resolveElementStyle } from './style/spec-defaults.js';

export interface RenderSvgOptions {
  /** The loaded style spec, if any — accent/shape/variant overrides. Omit to render with the Enterprise defaults. */
  spec?: Spec;
  /** Which theme's tokens to embed as literal (resolved) values — a standalone SVG has no CSS custom property scope of its own. Defaults to `'light'`. */
  theme?: ThemeName;
  /** A title for accessibility/document metadata. Defaults to `'C4 diagram'`. */
  title?: string;
}

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
 * Computes a node's palette per the Enterprise `.c4-el` derivation
 * (ELEMENT_TINTS): lift the accent toward white in dark, tint the elevated
 * surface with it, alpha it for the border, mix it into ink for the eyebrow.
 * An accent this module can't parse (an exotic authored spec.yaml value —
 * see style/color-mix.ts) falls back to flat theme surfaces with the raw
 * accent string passed through for the identity stripe, documented in
 * docs/c4/drift-log.md entry 14.
 */
function nodePaletteFor(
  rawAccent: string,
  theme: ThemeName,
  tokens: Readonly<Record<TokenName, string>>,
): NodePalette {
  const tints = ELEMENT_TINTS[theme];
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
    tints.accentLiftPct > 0 ? mixOklab(accentRgb, WHITE, (100 - tints.accentLiftPct) / 100) : accentRgb;
  const eyebrowRgb = tints.eyebrowPct === 100 ? lifted : mixOklab(lifted, inkRgb, tints.eyebrowPct / 100);

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
  const palette = nodePaletteFor(style.accent, theme, tokens);
  const stripeDash = style.variant === 'external' ? ' stroke-dasharray="6 3"' : '';

  const parts: string[] = [];
  parts.push(`<g aria-label="${escapeXml(`${node.kind ?? 'element'}: ${node.title}`)}">`);
  if (shape.kind === 'rect') {
    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${shape.rx}" ry="${shape.ry}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1"/>`,
    );
  } else {
    parts.push(`<path d="${shape.outline}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1"/>`);
    if (shape.decoration !== undefined) {
      parts.push(`<path d="${shape.decoration}" fill="none" stroke="${palette.border}" stroke-width="1"/>`);
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

function renderEdge(edge: PositionedEdge, spec: Spec | undefined): string {
  const style = resolveConnectionStyle(edge.category, spec);
  const d = orthogonalEdgePath(edge.route);
  const dash = style.style === 'dashed' ? ' stroke-dasharray="6 4"' : '';
  const parts: string[] = [];
  const label = `${edge.from} to ${edge.to}${edge.label ? `: ${edge.label}` : ''}`;
  parts.push(`<g aria-label="${escapeXml(label)}">`);
  parts.push(
    `<path d="${d}" fill="none" stroke="${style.accent}" stroke-width="1.5"${dash} marker-end="url(#${markerIdFor(style.accent)})"/>`,
  );
  if (edge.label !== null) {
    const mid = routeMidpoint(edge.route);
    parts.push(
      `<text x="${mid.x}" y="${mid.y - 4}" font-size="11" text-anchor="middle">${escapeXml(truncateLabel(edge.label, 28))}</text>`,
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

  const accents = uniqueAccents(diagram.edges.map((edge) => resolveConnectionStyle(edge.category, options.spec).accent));
  const markers = accents
    .map(
      (accent) =>
        `<marker id="${markerIdFor(accent)}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${accent}"/></marker>`,
    )
    .join('');

  const edgesSvg = diagram.edges.map((edge) => renderEdge(edge, options.spec)).join('');
  const nodesSvg = diagram.nodes.map((node) => renderNode(node, options.spec, theme, tokens)).join('');
  const canvasBg = tokens['--canvas-bg'];

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" ` +
    `role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<defs>${markers}</defs>` +
    `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${canvasBg}"/>` +
    `<g>${edgesSvg}</g>` +
    `<g>${nodesSvg}</g>` +
    `</svg>`
  );
}
