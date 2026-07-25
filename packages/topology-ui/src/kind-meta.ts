// Per-`ResourceKind` display metadata: the human-readable KINDNAME label and
// the WorkSpec design token that accents a kind's glyph. Ported from the
// authoritative design's `KINDNAME`/`KINDCOL` maps (Topology Workbench.dc.html),
// translated from that document's own local demo CSS variables (`--mod`,
// `--el-component`, `--el-external`) onto the nearest REAL `@workspec/design`
// token — see the per-entry comments below for the mapping rationale. Every
// value here is a token NAME (`--*`), never a literal colour, per the
// project's "no local token values" rule.

import type { ResourceKindType } from '@workspec/topology-schema';
import type { TokenName } from './themes.js';

/**
 * Human-readable label for a resource kind, shown in the side panel's
 * detail view ("kind" row) and the resource-list rows. Ported verbatim from
 * the design's `KINDNAME` map; extended with the kinds
 * `@workspec/topology-schema`'s `RESOURCE_KINDS` declares that the design
 * doesn't cover (`resource-group`, `edge`, `gateway`, `identity`, `search`,
 * `storage`, `vault`) so every closed-set kind has a label.
 */
export const KIND_NAME: Record<ResourceKindType, string> = {
  client: 'Client',
  compute: 'Compute',
  function: 'Serverless',
  database: 'Data store',
  cache: 'Cache',
  endpoint: 'Private endpoint',
  monitor: 'Monitoring',
  vnet: 'Virtual network',
  subnet: 'Subnet',
  'resource-group': 'Resource group',
  edge: 'Edge',
  gateway: 'Gateway',
  identity: 'Identity',
  search: 'Search',
  storage: 'Storage',
  vault: 'Key vault',
};

/**
 * The design token accenting each kind's glyph (icon background tint +
 * icon colour). The design's own `KINDCOL` map used three local-only demo
 * variables that don't exist in the real `@workspec/design` token set —
 * verified against `console-dark.css`/`console-light.css` and mapped onto
 * their real equivalents:
 *
 * - the demo's `--mod` variable is, value-for-value in BOTH themes, exactly
 *   `--type-persona` — so `compute`/`monitor`/`vnet`/`subnet` (all `--mod`
 *   in the source) map to `--type-persona`, the same pastel blue the
 *   design's own hardcoded override for `compute` already confirmed.
 * - the demo's `--el-external` matches `--el-external-system`'s value in
 *   both themes exactly.
 * - the demo's `--el-component` (a violet with no real-token equivalent by
 *   NAME) is, by HUE, essentially the same violet as the real `--el-class`
 *   token — the closest real token to the rendered colour, so `database`
 *   maps there rather than to the same-named but differently-hued (teal)
 *   `--el-database`.
 *
 * `gateway`/`edge`/`identity` are glyphs the design draws but never colours
 * in `KINDCOL` (so it falls through to that map's own `'var(--ink-soft)'`
 * default) — for these THREE extra kinds only, distinct real tokens were
 * picked instead of leaving them neutral, since `edge` (Azure Front Door)
 * is a first-class resource in the golden web-app fixture and deserves a
 * glyph that reads apart from a plain endpoint. `resource-group` is left
 * OUT of this map deliberately, exactly like the source design: a
 * `resource-group` resource only gets a KINDCOL entry when it renders as an
 * ordinary NODE (i.e. in the network lens) and the design intentionally
 * lets that fall through to the neutral default, same as `endpoint`.
 * `search`/`storage`/`vault` (schema kinds outside the design's 12) fall
 * through to the same neutral default.
 */
export const KIND_COLOR_TOKEN: Partial<Record<ResourceKindType, TokenName>> = {
  client: '--el-external-system',
  compute: '--type-persona',
  function: '--type-scenario',
  cache: '--agent',
  database: '--el-class',
  monitor: '--type-persona',
  endpoint: '--ink-soft',
  vnet: '--type-persona',
  subnet: '--type-persona',
  gateway: '--el-queue',
  edge: '--el-queue',
  identity: '--el-domain',
};

/** The neutral fallback token for any kind not in {@link KIND_COLOR_TOKEN} (`resource-group`, `search`, `storage`, `vault`, …). */
export const KIND_COLOR_FALLBACK: TokenName = '--ink-soft';

/** The `var(--token)` CSS value accenting a kind's glyph. */
export function kindColorVar(kind: ResourceKindType): string {
  return `var(${KIND_COLOR_TOKEN[kind] ?? KIND_COLOR_FALLBACK})`;
}

/** The human-readable label for a kind, falling back to the raw kind string for forward-compatibility with a schema that adds kinds this map hasn't caught up with yet. */
export function kindDisplayName(kind: ResourceKindType): string {
  return KIND_NAME[kind] ?? kind;
}

/**
 * The two grouping kinds whose BOUNDARY BOX (not node-card) rendering gets
 * the accented treatment — a coloured dashed/solid border and a coloured
 * icon/label — ported from the design's `(isVnet || isRg) ? mod : muted`
 * boundary check. `subnet`'s boundary box deliberately stays neutral even
 * though it shares `vnet`'s grouping role, so a subnet box visually recedes
 * beneath its parent vnet's accented one instead of competing with it.
 */
export const ACCENTED_BOUNDARY_KINDS: ReadonlySet<ResourceKindType> = new Set([
  'vnet',
  'resource-group',
]);

/** The token an accented boundary box's border/icon/label use. */
export const BOUNDARY_ACCENT_TOKEN: TokenName = '--type-persona';

/** The `var(--token)` CSS value for a boundary box's border/icon/label — accented for `vnet`/`resource-group`, neutral otherwise. */
export function boundaryAccentVar(kind: ResourceKindType): string {
  return ACCENTED_BOUNDARY_KINDS.has(kind) ? `var(${BOUNDARY_ACCENT_TOKEN})` : 'var(--ink-muted)';
}
