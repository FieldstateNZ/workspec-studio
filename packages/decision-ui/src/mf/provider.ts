// Module-federation expose: `./provider` → the host-contract wiring an embedder
// needs to mount the exposed views. Exposed FROM the remote (rather than pulled
// from a separate copy of `@workspec/decision-ui` in the host) so the provider
// and the view components share ONE module instance — one `HostContext`, one
// QueryClient wiring — across the federation boundary. A host that imported the
// provider from its own bundled copy would create a second, disconnected
// context and the views' `useHost()` would throw.
import '../index.css';

export { DecisionStudioProvider } from '../context.js';
export type { DecisionStudioProviderProps } from '../context.js';
export { createInertLinkResolver } from '../host.js';
export type {
  DecisionStudioHost,
  DecisionStudioCapabilities,
  LinkResolver,
  LinkTarget,
} from '../host.js';
export type { ThemeName } from '../themes.js';
