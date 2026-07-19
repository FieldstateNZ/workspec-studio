// @workspec/trace-ui — host-agnostic React views for the WorkSpec
// Traceability Workbench: the persistent meters bar, the Requirements
// explorer, the Matrix (T6, #74), and Feature detail (T5, #73), composed by
// `TraceApp` and themed via a `theme` prop — no host framework or CSS
// assumptions baked in (standalone lib + module-federation remote, mirroring
// `@workspec/cost-ui`). Run review lands in T7 (see docs/traceability/spec.md §7/§8).
//
// Styles ship compiled and separate: import `@workspec/trace-ui/styles.css`.
export const TRACE_UI_PACKAGE = '@workspec/trace-ui' as const;

// ── Host contract ────────────────────────────────────────────────────────────
export { createInertLinkResolver, createMemoryRepository, repositoryId } from './host.js';
export type {
  MemoryRepositoryInit,
  TraceLinkResolution,
  TraceLinkResolver,
  TraceLinkTarget,
  TraceRepositoryPort,
  TraceStudioCapabilities,
  TraceStudioHost,
} from './host.js';

// ── Theming ──────────────────────────────────────────────────────────────────
export { DEFAULT_THEME, DESIGN_THEMES, THEMES, themeStyle } from './themes.js';
export type { ThemeName, TokenName } from './themes.js';
export { TraceThemedRoot, useAmbientTheme } from './themed-root.js';
export type { TraceThemedRootProps } from './themed-root.js';

// ── Provider + hooks ─────────────────────────────────────────────────────────
export {
  HostNavigateProvider,
  TraceStudioProvider,
  traceModelKey,
  useCapabilities,
  useHost,
  useInvalidateTraceModel,
  useLinkResolver,
  useNavigate,
  useRepository,
  useTraceModel,
} from './context.js';
export type { TraceStudioProviderProps } from './context.js';

// ── Formatting helpers ───────────────────────────────────────────────────────
export {
  formatMeterFraction,
  formatPercent,
  formatProofTally,
  PROOF_ACCENT,
  PROOF_LABEL,
  STATUS_ACCENT,
  tallyProofs,
} from './format.js';
export type { ProofTally } from './format.js';

// ── Views ────────────────────────────────────────────────────────────────────
export { MetersBar } from './meters-bar.js';
export type { MetersBarProps } from './meters-bar.js';
export { RequirementsExplorer } from './requirements-explorer.js';
export type { RequirementsExplorerProps } from './requirements-explorer.js';
export { MatrixView } from './matrix-view.js';
export type { MatrixViewProps } from './matrix-view.js';
export { FeatureDetail } from './feature-detail.js';
export type { FeatureDetailProps } from './feature-detail.js';

// ── App ──────────────────────────────────────────────────────────────────────
export { TraceApp } from './app.js';
export type { TraceAppProps, TraceView } from './app.js';
