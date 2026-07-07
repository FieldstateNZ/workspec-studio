// The Enterprise-defaults data module — the SINGLE documented exception to
// this package's zero-local-tokens rule (see `zero-local-tokens.test.ts`,
// which greps `src/` for raw hex/`hsl(` literals and allow-lists exactly this
// file). `DEFAULT_ELEMENT_STYLES`/`DEFAULT_CONNECTION_STYLES` below are a
// byte-for-byte mirror of WorkSpec Enterprise's `DEFAULT_ELEMENT_STYLES`/
// `DEFAULT_CONNECTION_STYLES` in `lib/yaml-schemas/src/spec.ts` — Enterprise
// conformance DATA (which hue is "the" accent for a container vs. a queue),
// not a design token. Every other colour in this package (surface, ink,
// border, shadow, spacing, radius, font) comes from `@workspec/design`
// tokens via `var(--*)` — only the per-kind/per-category *accent* hue and
// the shape/variant/icon choice are sourced here, and a loaded `spec.yaml`
// can override any of them at runtime (`resolveElementStyle`/
// `resolveConnectionStyle` below apply those overrides; the defaults here
// are only the fallback for an absent or partial spec).

import { STYLE_CONNECTION_STYLES, STYLE_SHAPES } from '@workspec/c4-schema';
import type { Spec } from '@workspec/c4-schema';

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

/**
 * Byte-for-byte mirror of Enterprise's `DEFAULT_ELEMENT_STYLES`
 * (`lib/yaml-schemas/src/spec.ts`) — one entry per C4_REF_KINDS kind (the
 * nine backed by a real element schema in this tree, plus `class`/
 * `interface`/`function`, kept for full conformance even though those three
 * have no element schema or directory in `@workspec/c4-schema` today).
 */
export const DEFAULT_ELEMENT_STYLES: Readonly<Record<string, ResolvedElementStyle>> = {
  actor: { accent: '#4A90D9', icon: 'user', shape: 'box', variant: null },
  system: { accent: '#1168BD', icon: 'box', shape: 'box', variant: null },
  'external-system': { accent: '#64748b', icon: 'external-link', shape: 'box', variant: 'external' },
  container: { accent: 'hsl(214 88% 51%)', icon: 'server', shape: 'box', variant: null },
  // A C4 component is a `feature` in WorkSpec — mirror feature's styling so a
  // (transient) component node reads as one.
  component: { accent: 'hsl(166 50% 40%)', icon: 'package', shape: 'box', variant: null },
  database: { accent: 'hsl(186 79% 35%)', icon: 'database', shape: 'cylinder', variant: null },
  queue: { accent: 'hsl(280 50% 55%)', icon: 'git-merge', shape: 'pill', variant: null },
  domain: { accent: 'hsl(150 35% 38%)', icon: 'boxes', shape: 'box', variant: null },
  feature: { accent: 'hsl(166 50% 40%)', icon: 'package', shape: 'box', variant: null },
  class: { accent: 'hsl(262 52% 58%)', icon: 'braces', shape: 'box', variant: null },
  interface: { accent: 'hsl(199 65% 48%)', icon: 'brackets', shape: 'box', variant: null },
  function: { accent: 'hsl(150 45% 42%)', icon: 'parentheses', shape: 'box', variant: null },
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
 * falling back to {@link UNKNOWN_ELEMENT_STYLE} for a kind Enterprise has no
 * entry for (e.g. a legacy fat-diagram node's free-string `type`). A
 * `shape`/`variant` override with an unrecognised value is ignored (falls
 * through to the default), matching Enterprise's "lenient input, normalising
 * compiler" contract — this package never hard-fails on an authored style.
 */
export function resolveElementStyle(kind: string | null, spec: Spec | undefined): ResolvedElementStyle {
  const fallback = (kind !== null ? DEFAULT_ELEMENT_STYLES[kind] : undefined) ?? UNKNOWN_ELEMENT_STYLE;
  const override = kind !== null ? spec?.elements[kind] : undefined;
  if (!override) return fallback;

  return {
    accent: override.accent ?? fallback.accent,
    icon: override.icon ?? fallback.icon,
    shape: isElementShape(override.shape) ? override.shape : fallback.shape,
    variant: override.variant === 'external' ? 'external' : override.variant == null ? fallback.variant : null,
  };
}

/**
 * Resolves one connection category's visual style: the loaded `spec.yaml`'s
 * `connections[category]` overrides layered over the Enterprise default for
 * that category, falling back to {@link UNKNOWN_CONNECTION_STYLE} for a
 * category the spec never defines and Enterprise has no default for (an
 * edge with no `category` at all, or a category string outside the four
 * built-ins).
 */
export function resolveConnectionStyle(category: string | null, spec: Spec | undefined): ResolvedConnectionStyle {
  const fallback = (category !== null ? DEFAULT_CONNECTION_STYLES[category] : undefined) ?? UNKNOWN_CONNECTION_STYLE;
  const override = category !== null ? spec?.connections[category] : undefined;
  if (!override) return fallback;

  return {
    accent: override.accent ?? fallback.accent,
    style: isConnectionLineStyle(override.style) ? override.style : fallback.style,
  };
}
