// @workspec/cost-ui — host-agnostic React views for WorkSpec Cost
// Attribution. Depends on cost-engine + cost-schema + @workspec/design.
//
// Styles ship compiled and separate: import `@workspec/cost-ui/styles.css`.
export const COST_UI_PACKAGE = '@workspec/cost-ui' as const;

// ── Host contract ────────────────────────────────────────────────────────────
export { createInertLinkResolver, repositoryId } from './host.js';
export type {
  CostLinkResolution,
  CostLinkResolver,
  CostLinkTarget,
  CostStudioCapabilities,
  CostStudioHost,
} from './host.js';

// ── Theming ──────────────────────────────────────────────────────────────────
export { DEFAULT_THEME, DESIGN_THEMES, THEMES, themeStyle } from './themes.js';
export type { ThemeName, TokenName } from './themes.js';

// ── Provider + hooks ─────────────────────────────────────────────────────────
export {
  attributionKey,
  attributionsKey,
  CostStudioProvider,
  HostNavigateProvider,
  inventoriesKey,
  inventoryKey,
  spendsKey,
  tagPlanKey,
  tagPlansKey,
  useAttribution,
  useAttributions,
  useCapabilities,
  useCostArtifacts,
  useHost,
  useInventories,
  useInventory,
  useLinkResolver,
  useNavigate,
  useRepository,
  useSpends,
  useTagPlan,
  useTagPlans,
  useWriteAttribution,
} from './context.js';
export type { CostArtifacts, CostStudioProviderProps, WriteAttributionVars } from './context.js';

// ── Formatting / derivation helpers ─────────────────────────────────────────
export {
  assignChipsOf,
  buildPromotedRule,
  cascadeValueLabel,
  chipAccentFor,
  clampPercent,
  computeUnattributedClusters,
  filterEnabledRules,
  formatMoney,
  formatPercent,
  formatPeriodLabel,
  matchLineOf,
  nextRuleId,
  splitCellLabel,
} from './format.js';
export type { EffectChip, UnattributedCluster } from './format.js';

// ── Views ────────────────────────────────────────────────────────────────────
export { AttributionWorkbench, DEFAULT_WORKBENCH_STATE } from './attribution-workbench.js';
export type { AttributionWorkbenchProps, AttributionWorkbenchState } from './attribution-workbench.js';
export { CostInventory } from './cost-inventory.js';
export type { CostInventoryProps } from './cost-inventory.js';
export { CostReport } from './cost-report.js';
export type { CostReportProps } from './cost-report.js';
export { TagPlanView } from './tag-plan-view.js';
export type { TagPlanViewProps } from './tag-plan-view.js';

// ── App ──────────────────────────────────────────────────────────────────────
export { CostApp } from './app.js';
export type { CostAppProps, CostView } from './app.js';
