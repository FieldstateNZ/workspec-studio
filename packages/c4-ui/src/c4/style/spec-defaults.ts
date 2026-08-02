// The Enterprise-defaults data module — a documented exception to the
// package's zero-local-tokens rule (see `token-audit.test.ts`, which
// allow-lists exactly this file plus `c4/style/status-colors.ts` and
// `c4/style/local-tokens.css`).
//
// CANONICAL COPY (S3, #119): this file is the reconciled single source of
// truth for the C4 default element/connection styles, ported from
// `packages/c4-ui/src/style/spec-defaults.ts` (whose file is now a pure
// re-export of this one — S4's facade swap, kept through the canvas-c4
// fold, ADR i). Its documented history carries over:
//
// - `DEFAULT_CONNECTION_STYLES` is a byte-for-byte mirror of WorkSpec
//   Enterprise's `DEFAULT_CONNECTION_STYLES` (`lib/yaml-schemas/src/spec.ts`)
//   — Enterprise conformance DATA (which hue is "the" accent for a data
//   edge vs. a governance one), not a design token.
// - `DEFAULT_ELEMENT_STYLES`' accents are a deliberate, documented
//   DEVIATION from the Enterprise `NODE_TYPE_COLOURS` literals (Site
//   Review UX pass, findings 01/02): each kind references a `--el-*` /
//   `--type-*` token in `@workspec/design` so C4 and Decisions share one
//   accent vocabulary. The dark-theme rendered result is unchanged (the
//   tokens carry the exact values the literals did); only the source of
//   truth moved.
//
// Every other colour in this C4 layer derives from the accent in CSS (the
// `.c4-el` token layer in the layer's index.css) or comes from
// `@workspec/design` tokens directly.

import type { Spec } from '@workspec/c4-schema';
import { STYLE_CONNECTION_STYLES, STYLE_SHAPES } from '@workspec/c4-schema';

/** The shape values a resolved element style always narrows to. */
export type ElementShape = (typeof STYLE_SHAPES)[number];

/** The line-style values a resolved connection style always narrows to. */
export type ConnectionLineStyle = (typeof STYLE_CONNECTION_STYLES)[number];

/** One kind's fully resolved visual style: a concrete accent + icon + shape + optional variant. */
export interface ResolvedElementStyle {
  readonly accent: string;
  readonly icon: string;
  readonly shape: ElementShape;
  readonly variant: 'external' | null;
}

/** One category's fully resolved visual style: a concrete accent + line style. */
export interface ResolvedConnectionStyle {
  readonly accent: string;
  readonly style: ConnectionLineStyle;
}

/** One entry per C4 kind; accents reference `@workspec/design` tokens (see the file header). */
export const DEFAULT_ELEMENT_STYLES: Readonly<Record<string, ResolvedElementStyle>> = {
  actor: { accent: 'var(--el-actor)', icon: 'user', shape: 'box', variant: null },
  system: { accent: 'var(--el-system)', icon: 'box', shape: 'box', variant: null },
  'external-system': {
    accent: 'var(--el-external-system)',
    icon: 'external-link',
    shape: 'box',
    variant: 'external',
  },
  container: { accent: 'var(--el-container)', icon: 'server', shape: 'box', variant: null },
  // A C4 component is a `feature` in WorkSpec — mirror feature's styling (and
  // its token) so a (transient) component node reads as one.
  component: { accent: 'var(--type-feature)', icon: 'package', shape: 'box', variant: null },
  database: { accent: 'var(--el-database)', icon: 'database', shape: 'cylinder', variant: null },
  queue: { accent: 'var(--el-queue)', icon: 'git-merge', shape: 'pill', variant: null },
  domain: { accent: 'var(--el-domain)', icon: 'boxes', shape: 'box', variant: null },
  feature: { accent: 'var(--type-feature)', icon: 'package', shape: 'box', variant: null },
  class: { accent: 'var(--el-class)', icon: 'braces', shape: 'box', variant: null },
  interface: { accent: 'var(--el-interface)', icon: 'brackets', shape: 'box', variant: null },
  function: { accent: 'var(--el-function)', icon: 'parentheses', shape: 'box', variant: null },
};

/** Byte-for-byte mirror of Enterprise's `DEFAULT_CONNECTION_STYLES` (`lib/yaml-schemas/src/spec.ts`). */
export const DEFAULT_CONNECTION_STYLES: Readonly<Record<string, ResolvedConnectionStyle>> = {
  interaction: { accent: '#64748b', style: 'solid' },
  data: { accent: '#4CAF50', style: 'solid' },
  governance: { accent: '#9C27B0', style: 'dashed' },
  identity: { accent: '#4A90D9', style: 'solid' },
};

/** The fallback style for a kind with no Enterprise default and no spec override — a design TOKEN, not a hardcoded hue. */
const UNKNOWN_ELEMENT_STYLE: ResolvedElementStyle = {
  accent: 'var(--ink-fade)',
  icon: 'box',
  shape: 'box',
  variant: null,
};

/** The fallback style for a category with no Enterprise default and no spec override — a design TOKEN, not a hardcoded hue. */
const UNKNOWN_CONNECTION_STYLE: ResolvedConnectionStyle = {
  accent: 'var(--ink-fade)',
  style: 'solid',
};

function isElementShape(value: string | undefined): value is ElementShape {
  return value !== undefined && (STYLE_SHAPES as readonly string[]).includes(value);
}

function isConnectionLineStyle(value: string | undefined): value is ConnectionLineStyle {
  return value !== undefined && (STYLE_CONNECTION_STYLES as readonly string[]).includes(value);
}

/**
 * Resolves one element kind's visual style: the loaded `spec.yaml`'s
 * `elements[kind]` overrides (accent/icon/shape/variant, each independently
 * optional) layered over the Enterprise default for that kind, itself
 * falling back to {@link UNKNOWN_ELEMENT_STYLE}. An unrecognised
 * `shape`/`variant` override is ignored — the resolver never hard-fails on
 * an authored style.
 */
export function resolveElementStyle(
  kind: string | null,
  spec: Spec | undefined,
): ResolvedElementStyle {
  const fallback =
    (kind !== null ? DEFAULT_ELEMENT_STYLES[kind] : undefined) ?? UNKNOWN_ELEMENT_STYLE;
  const override = kind !== null ? spec?.elements[kind] : undefined;
  if (!override) return fallback;

  return {
    accent: override.accent ?? fallback.accent,
    icon: override.icon ?? fallback.icon,
    shape: isElementShape(override.shape) ? override.shape : fallback.shape,
    variant:
      override.variant === 'external'
        ? 'external'
        : override.variant == null
          ? fallback.variant
          : null,
  };
}

/**
 * Resolves one connection category's visual style: the loaded `spec.yaml`'s
 * `connections[category]` overrides layered over the Enterprise default,
 * falling back to {@link UNKNOWN_CONNECTION_STYLE}.
 */
export function resolveConnectionStyle(
  category: string | null,
  spec: Spec | undefined,
): ResolvedConnectionStyle {
  const fallback =
    (category !== null ? DEFAULT_CONNECTION_STYLES[category] : undefined) ??
    UNKNOWN_CONNECTION_STYLE;
  const override = category !== null ? spec?.connections[category] : undefined;
  if (!override) return fallback;

  return {
    accent: override.accent ?? fallback.accent,
    style: isConnectionLineStyle(override.style) ? override.style : fallback.style,
  };
}
