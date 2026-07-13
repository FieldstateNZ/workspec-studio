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

declare module 'c4Ui/C4Diagram' {
  import type { C4DiagramProps } from '@workspec/c4-ui';
  import type { ReactElement } from 'react';
  const C4Diagram: (props: C4DiagramProps) => ReactElement;
  export default C4Diagram;
}

declare module 'c4Ui/C4Explorer' {
  import type { C4ExplorerProps } from '@workspec/c4-ui';
  import type { ReactElement } from 'react';
  const C4Explorer: (props: C4ExplorerProps) => ReactElement;
  export default C4Explorer;
}

declare module 'c4Ui/reactProbe' {
  /** Reports whether the remote's React is the host-stamped instance. */
  export function reactProbe(): { sameInstance: boolean; version: string };
  const _default: typeof reactProbe;
  export default _default;
}

declare module 'costStudio/provider' {
  export { CostStudioProvider, createInertLinkResolver } from '@workspec/cost-ui';
  export type {
    CostStudioProviderProps,
    CostStudioHost,
    CostStudioCapabilities,
    CostLinkResolver,
    CostLinkTarget,
    CostLinkResolution,
    ThemeName,
  } from '@workspec/cost-ui';
}

declare module 'costStudio/CostInventory' {
  import type { CostInventoryProps } from '@workspec/cost-ui';
  import type { ReactElement } from 'react';
  const CostInventory: (props: CostInventoryProps) => ReactElement;
  export default CostInventory;
}

declare module 'costStudio/AttributionWorkbench' {
  import type { AttributionWorkbenchProps } from '@workspec/cost-ui';
  import type { ReactElement } from 'react';
  const AttributionWorkbench: (props: AttributionWorkbenchProps) => ReactElement;
  export default AttributionWorkbench;
}

declare module 'costStudio/CostReport' {
  import type { CostReportProps } from '@workspec/cost-ui';
  import type { ReactElement } from 'react';
  const CostReport: (props: CostReportProps) => ReactElement;
  export default CostReport;
}

declare module 'costStudio/TagPlanView' {
  import type { TagPlanViewProps } from '@workspec/cost-ui';
  import type { ReactElement } from 'react';
  const TagPlanView: (props: TagPlanViewProps) => ReactElement;
  export default TagPlanView;
}

declare module 'costStudio/reactProbe' {
  /** Reports whether the remote's React is the host-stamped instance. */
  export function reactProbe(): { sameInstance: boolean; version: string };
  const _default: typeof reactProbe;
  export default _default;
}
