// @workspec/decision-ui — host-agnostic React views for WorkSpec Decision Studio.
//
// S4 (#5) ships: the `DecisionStudioProvider` + host contract, the
// `DecisionWorkspace` view, and the live cost editor. Components receive
// everything — repository, links, capabilities — via the provider; there is no
// global, no ambient theme, no direct storage access. S5 (#6) adds Compare /
// Catalog / ADR; S6 (#7) adds the module-federation remote build against this
// exact contract; S10 (#8) replaces the interim namespaced token layer with
// WorkSpec design tokens and components from @workspec/design.
//
// Styles ship compiled and separate: import `@workspec/decision-ui/styles.css`.

import { ENGINE_TARGET_SCHEMA } from '@workspec/decision-engine';

/** The artifact schema version this UI build renders. */
export const UI_TARGET_SCHEMA = ENGINE_TARGET_SCHEMA;

// ── Host contract ─────────────────────────────────────────────────────────────
export { createInertLinkResolver, repositoryId, resolveCatalogRef } from './host.js';
export type {
  DecisionStudioHost,
  DecisionStudioCapabilities,
  LinkResolver,
  LinkResolution,
  LinkTarget,
} from './host.js';

// ── Provider + hooks ──────────────────────────────────────────────────────────
export {
  DecisionStudioProvider,
  HostCapabilitiesProvider,
  useHost,
  useRepository,
  useCapabilities,
  useLinkResolver,
  useNavigate,
  useDecision,
  useDecisions,
  useCatalog,
  useCatalogs,
  useWriteDecision,
  useWriteCatalog,
  decisionKey,
  decisionsKey,
  catalogKey,
  catalogsKey,
} from './context.js';
export type {
  DecisionStudioProviderProps,
  WriteDecisionVars,
  WriteCatalogVars,
} from './context.js';

// ── Views ───────────────────────────────────────────────────────────────────
export { DecisionWorkspace } from './workspace.js';
export type { DecisionWorkspaceProps } from './workspace.js';
export { DecisionCompare } from './compare.js';
export type { DecisionCompareProps } from './compare.js';
export { DecisionCatalog } from './catalog.js';
export type { DecisionCatalogProps } from './catalog.js';
export { DecisionAdr } from './adr.js';
export type { DecisionAdrProps } from './adr.js';
export { ReadOnlyAdr } from './read-only-adr.js';
export type { ReadOnlyAdrProps } from './read-only-adr.js';

// ── Compact, read-only summary card (the S6 remote's `./DecisionCard`) ────────
export { DecisionCard } from './card.js';
export type { DecisionCardProps } from './card.js';

// ── Full four-view app (the S6 module-federation remote's `./DecisionWorkspace`) ─
export { DecisionApp } from './app.js';
export type { DecisionAppProps, DecisionView } from './app.js';

// ── Decide-flow + catalog-edit helpers (pure; used by the views, exported for
//    hosts that drive the port directly) ──────────────────────────────────────
export { decide, reopen, setRationale, suggestRationale } from './decide.js';
export type { DecideMeta } from './decide.js';
export {
  setSku,
  addSku,
  removeSku,
  setPricingMode,
  addPricingMode,
  removePricingMode,
  setSchedule,
  addSchedule,
  removeSchedule,
} from './catalog-edits.js';
export type { SkuPatch, PricingModePatch, SchedulePatch } from './catalog-edits.js';

// ── Theming (WorkSpec design tokens, owned by @workspec/design) ───────────────
export { DEFAULT_THEME, DESIGN_THEMES, THEMES, themeStyle } from './themes.js';
export type { ThemeName, TokenName } from './themes.js';

// ── Money formatting (shared with the engine / render-adr, P8) ───────────────
export { formatMoney, money } from './format.js';
