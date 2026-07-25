// Module-federation expose: `./provider` → the host-contract wiring an
// embedder needs to mount `./TopologyWorkbench`. Exposed FROM the remote
// (rather than pulled from a separate copy of `@workspec/topology-ui` in
// the host) so the provider and the workbench components share ONE module
// instance — one `HostContext`, one QueryClient wiring — across the
// federation boundary. A host that imported the provider from its own
// bundled copy would create a second, disconnected context and the
// workbench's `useHost()` would throw. Mirrors
// packages/decision-ui/src/mf/provider.ts.
import '../index.css';

export { TopologyStudioProvider } from '../context.js';
export type { TopologyStudioProviderProps } from '../context.js';
export { createInertLinkResolver } from '../host.js';
export type {
  LinkResolution,
  LinkResolver,
  LinkTarget,
  TopologyStudioCapabilities,
  TopologyStudioHost,
} from '../host.js';
export type { ThemeName } from '../themes.js';
