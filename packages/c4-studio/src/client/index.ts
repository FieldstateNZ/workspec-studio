// The client entry for the studio's write surface (A2, issue #132): the
// one import the browser shell (client/main.tsx, A1) needs to wire
// authoring — build the fetch-backed API, install the host on the canvas
// instance. Kept as a barrel so the shell depends on ONE stable path
// (`../src/client/index.js`) rather than this directory's internal layout:
//
//   import { createMutationApi, installStudioCanvasHost } from '../src/client/index.js';
//   const api = createMutationApi();
//   installStudioCanvasHost(instance, { diagramSlug: () => current, api, onMutated, onWriteError });

export { createMutationApi } from './mutation-api.js';
export type { MutationApi } from './mutation-api.types.js';
export { installStudioCanvasHost } from './studio-canvas-host.js';
export type { StudioCanvasHostOptions } from './studio-canvas-host.js';
