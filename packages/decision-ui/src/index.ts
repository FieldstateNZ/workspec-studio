import { ENGINE_TARGET_SCHEMA } from '@workspec/decision-engine';

export const UI_TARGET_SCHEMA = ENGINE_TARGET_SCHEMA;

export { createInertLinkResolver, decisionSlug, repositoryId } from './host.js';
export type {
  DecisionStudioHost,
  DecisionStudioCapabilities,
  LinkResolver,
  LinkResolution,
  LinkTarget,
} from './host.js';
export {
  DecisionStudioProvider,
  useHost,
  useRepository,
  useCapabilities,
  useLinkResolver,
  useNavigate,
  useDecision,
  useDecisions,
  useWriteDecision,
  decisionKey,
  decisionsKey,
} from './context.js';
export type { DecisionStudioProviderProps, WriteDecisionVars } from './context.js';
export { DecisionWorkspace } from './workspace.js';
export type { DecisionWorkspaceProps } from './workspace.js';
export { DecisionAdr, AdrView } from './adr.js';
export type { DecisionAdrProps } from './adr.js';
export { ReadOnlyAdr } from './read-only-adr.js';
export type { ReadOnlyAdrProps } from './read-only-adr.js';
export { DecisionCard } from './card.js';
export type { DecisionCardProps } from './card.js';
export { DecisionApp } from './app.js';
export type { DecisionAppProps, DecisionView } from './app.js';
export { DEFAULT_THEME, DESIGN_THEMES, THEMES, themeStyle } from './themes.js';
export type { ThemeName, TokenName } from './themes.js';
