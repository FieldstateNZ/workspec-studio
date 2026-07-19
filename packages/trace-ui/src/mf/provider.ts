// Module-federation expose: `./provider` → the host-contract wiring an
// embedder needs to mount the exposed views. Exposed FROM the remote (rather
// than pulled from a separate copy of `@workspec/trace-ui` in the host) so
// the provider and the view components share ONE module instance — one
// `HostContext`, one QueryClient wiring — across the federation boundary. A
// host that imported the provider from its own bundled copy would create a
// second, disconnected context and `useHost()` would throw. Mirrors
// packages/cost-ui/src/mf/provider.ts.
import '../index.css';

export { TraceStudioProvider, useTraceModel } from '../context.js';
export type { TraceStudioProviderProps } from '../context.js';
export { createInertLinkResolver, createMemoryRepository } from '../host.js';
export type {
  MemoryRepositoryInit,
  TraceLinkResolution,
  TraceLinkResolver,
  TraceLinkTarget,
  TraceRepositoryPort,
  TraceStudioCapabilities,
  TraceStudioHost,
} from '../host.js';
export type { ThemeName } from '../themes.js';
