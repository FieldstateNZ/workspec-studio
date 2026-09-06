// @workspec/topology-ui — host-agnostic React components for the WorkSpec
// Topology Workbench (standalone lib + module-federation remote).
//
// This is the AUTHORED-ONLY v0 surface: a header (title, env/lens
// switchers, counts), a canvas (boundary boxes, node cards, declared
// edges), and a side panel (resource list ⇄ node detail) over a
// `@workspec/topology-model` `ResolvedTopology` + `LensTree`. The drift
// (P5 recon) and cost (P6) overlays are typed extension-point seams only —
// see `overlays.ts` — not implemented in this slice.
//
// Styles ship compiled and separate: import `@workspec/topology-ui/styles.css`.

// ── Host contract ────────────────────────────────────────────────────────────
export { createInertLinkResolver, sourceId } from './host.js';
export type {
  LinkResolution,
  LinkResolver,
  LinkTarget,
  TopologyStudioCapabilities,
  TopologyStudioHost,
} from './host.js';

// ── Provider + hooks ─────────────────────────────────────────────────────────
export {
  costKey,
  lensTreeKey,
  reconcileKey,
  resolvedTopologyKey,
  topologyModelKey,
  TopologyStudioProvider,
  useCapabilities,
  useCost,
  useHost,
  useLensTree,
  useLinkResolver,
  useReconcile,
  useResolvedTopology,
  useSource,
  useTopologyModel,
} from './context.js';
export type { CostViewResult, ReconcileResult, TopologyStudioProviderProps } from './context.js';

// ── Top-level component ──────────────────────────────────────────────────────
export { TopologyWorkbench } from './topology-workbench.js';
export type { TopologyWorkbenchProps } from './topology-workbench.js';

// ── Composable pieces (for a host that wants to build its own layout) ───────
export { WorkbenchHeader } from './workbench-header.js';
export type { WorkbenchHeaderProps } from './workbench-header.js';
export { EnvSwitcher } from './env-switcher.js';
export type { EnvSwitcherProps } from './env-switcher.js';
export { LensSwitcher } from './lens-switcher.js';
export type { LensSwitcherProps } from './lens-switcher.js';
export { TopologyCanvas } from './topology-canvas.js';
export type { TopologyCanvasProps } from './topology-canvas.js';
export { SidePanel } from './side-panel.js';
export type { SidePanelProps } from './side-panel.js';
export { ResourceList } from './resource-list.js';
export type { ResourceListProps } from './resource-list.js';
export { NodeDetail } from './node-detail.js';
export type { NodeDetailProps } from './node-detail.js';
export { NodeCard } from './node-card.js';
export type { NodeCardProps } from './node-card.js';
export { BoundaryBox } from './boundary-box.js';
export type { BoundaryBoxProps } from './boundary-box.js';
export { Glyph } from './glyph.js';
export type { GlyphProps } from './glyph.js';

// ── Payload views (P5 drift / P6 cost) ───────────────────────────────────────
export { ViewSwitcher } from './view-switcher.js';
export type { ViewSwitcherProps, WorkbenchView } from './view-switcher.js';
export { DriftSidePanel } from './drift-side-panel.js';
export type { DriftSidePanelProps } from './drift-side-panel.js';
export { DriftPanel } from './drift-panel.js';
export type { DriftPanelProps } from './drift-panel.js';
export { OrphanDetail } from './orphan-detail.js';
export type { OrphanDetailProps } from './orphan-detail.js';
export { CostSidePanel } from './cost-side-panel.js';
export type { CostSidePanelProps } from './cost-side-panel.js';
export { CostPanel } from './cost-panel.js';
export type { CostPanelProps } from './cost-panel.js';
export { buildDriftBySlug, buildGhostEdges, buildOrphanNodes } from './drift-canvas-data.js';
export { buildDriftGroups, driftForAuthoredSlug, orphanDriftForSlug } from './drift-panel-data.js';
export type { DriftClassGroup, DriftListItem } from './drift-panel-data.js';
export { buildBoundaryCostBySlug, buildCostBySlug } from './cost-canvas-data.js';
export { buildCostPanelData } from './cost-panel-data.js';
export type { AttributionRow, CostPanelData, CostRow } from './cost-panel-data.js';
export { DriftGlyph } from './drift-glyph.js';
export type { DriftGlyphProps } from './drift-glyph.js';
export { DRIFT_CLASSES, DRIFT_META, driftColorVar } from './drift-meta.js';
export type { DriftClassMeta } from './drift-meta.js';
export { ModeIcon } from './mode-icon.js';
export type { ModeIconProps } from './mode-icon.js';
export { formatMonthly } from './format-money.js';
export type { GhostEdge } from './edge-layer.js';
export type { OrphanCanvasNode } from './topology-canvas.js';
export type { NodeDetailCost } from './node-detail.js';

// ── Extension-point types (P5 recon / P6 cost seams — see overlays.ts) ──────
export { CostPill, DriftBadge } from './overlays.js';
export type { DriftClass, NodeCost } from './overlays.js';

// ── Presentation metadata ────────────────────────────────────────────────────
export {
  ACCENTED_BOUNDARY_KINDS,
  boundaryAccentVar,
  KIND_COLOR_TOKEN,
  KIND_NAME,
  kindColorVar,
  kindDisplayName,
} from './kind-meta.js';
export { formatLensCounts } from './format-counts.js';

// ── Theming (WorkSpec design tokens, owned by @workspec/design) ───────────────
export { DEFAULT_THEME, DESIGN_THEMES, THEMES, themeStyle } from './themes.js';
export type { ThemeName, TokenName } from './themes.js';

// ── Infrastructure planning (extracted Enterprise workflow) ─────────────────
export { InfrastructurePlanEditor } from './infrastructure-plan-editor.js';
export type { InfrastructurePlanEditorProps } from './infrastructure-plan-editor.js';
export { CostAnalysisEditor } from './cost-analysis-editor.js';
export type { CostAnalysisEditorProps } from './cost-analysis-editor.js';
export { ProviderComparison, SolutionComparison } from './provider-comparison.js';
export type { ProviderComparisonProps, SolutionComparisonProps } from './provider-comparison.js';
