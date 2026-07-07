// Types for the federated `decisionStudio/*` modules (dts consumption is off, so
// these are hand-written). They reference the real types from the local
// @workspec/decision-ui dependency — the runtime code comes from the remote, but
// the shapes are identical because the remote is built from that same package.

declare module 'decisionStudio/provider' {
  export { DecisionStudioProvider, createInertLinkResolver } from '@workspec/decision-ui';
  export type {
    DecisionStudioProviderProps,
    DecisionStudioHost,
    DecisionStudioCapabilities,
    LinkResolver,
    LinkTarget,
    ThemeName,
  } from '@workspec/decision-ui';
}

declare module 'decisionStudio/DecisionCard' {
  import type { DecisionCardProps } from '@workspec/decision-ui';
  import type { ReactElement } from 'react';
  const DecisionCard: (props: DecisionCardProps) => ReactElement;
  export default DecisionCard;
}

declare module 'decisionStudio/DecisionWorkspace' {
  import type { DecisionAppProps } from '@workspec/decision-ui';
  import type { ReactElement } from 'react';
  const DecisionWorkspace: (props: DecisionAppProps) => ReactElement;
  export default DecisionWorkspace;
}

declare module 'decisionStudio/AdrView' {
  import type { ReadOnlyAdrProps } from '@workspec/decision-ui';
  import type { ReactElement } from 'react';
  const AdrView: (props: ReadOnlyAdrProps) => ReactElement;
  export default AdrView;
}

declare module 'decisionStudio/reactProbe' {
  /** Reports whether the remote's React is the host-stamped instance. */
  export function reactProbe(): { sameInstance: boolean; version: string };
  const _default: typeof reactProbe;
  export default _default;
}
