// The level-tab derivation `C4Explorer` builds its segmented header from —
// split out (A1, #131) so hosts composing their own diagram navigation
// (c4-studio's sidebar diagrams list) reuse the EXACT numbering + ordering
// rules instead of re-implementing them: the first entry is also the
// explorer's default selection, so a host-rendered list and the explorer
// can never disagree about which diagram a fresh mount opens on.

import type { ResolvedDiagram } from '@workspec/c4-model';

/** One segmented header tab: a label plus the diagram slug it activates. */
export interface LevelTab {
  readonly slug: string;
  readonly label: string;
}

/**
 * The three canonical C4 levels this scheme numbers, in level order. A
 * diagram type outside this list (`c4-code`, `sequence`, `er`, `flow`,
 * `deployment`, `custom`, …) never gets a numbered tab — see
 * {@link deriveLevelTabs}.
 */
const LEVEL_DEFS: readonly { readonly type: string; readonly label: string }[] = [
  { type: 'c4-context', label: '1 · Context' },
  { type: 'c4-container', label: '2 · Container' },
  { type: 'c4-component', label: '3 · Component' },
];

/**
 * Builds the header's segmented level tabs from every diagram in the model.
 * A canonical level (`c4-context`/`c4-container`/`c4-component`) gets its
 * numbered label ("1 · Context" etc.) ONLY when the model has EXACTLY ONE
 * diagram of that type — that's the only case where "this tab IS level N"
 * is unambiguous. Everything else (a type outside the three, or a second
 * diagram sharing an already-claimed canonical type) falls back to that
 * diagram's own title as its tab label, appended after the numbered tabs in
 * `diagrams` order. Never invents a number for a diagram the scheme can't
 * uniquely place. The FIRST entry is the explorer's default selection
 * (lowest-numbered canonical level present, never raw discovery order).
 */
export function deriveLevelTabs(diagrams: readonly ResolvedDiagram[]): readonly LevelTab[] {
  const byType = new Map<string, ResolvedDiagram[]>();
  for (const diagram of diagrams) {
    const bucket = byType.get(diagram.type);
    if (bucket) bucket.push(diagram);
    else byType.set(diagram.type, [diagram]);
  }

  const tabs: LevelTab[] = [];
  const claimed = new Set<string>();
  for (const { type, label } of LEVEL_DEFS) {
    const bucket = byType.get(type);
    if (bucket && bucket.length === 1) {
      const diagram = bucket[0];
      if (diagram) {
        tabs.push({ slug: diagram.slug, label });
        claimed.add(diagram.slug);
      }
    }
  }
  for (const diagram of diagrams) {
    if (!claimed.has(diagram.slug)) tabs.push({ slug: diagram.slug, label: diagram.title });
  }
  return tabs;
}
