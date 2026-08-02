# @workspec/canvas

Host-agnostic infinite-canvas engine for WorkSpec surfaces — a per-instance store factory with
undo/redo command history, camera/pointer/keyboard hooks, fractional-index z-order, an open
shape-module/tool/host extension surface, the whiteboard base shapes (sticky with media/typed
variants, text, draw, image, connector with the orthogonal edge router) and the full chrome stack
(shape/connector/selection layers, background grid, marquee, zoom controls, minimap, context menu,
toolbar). Ported from the WorkSpec enterprise canvas engine (epic #116: S1 core #117, S2
shapes/tools/chrome #118); C4 semantics layer on via `@workspec/c4-ui`'s C4 layer (S3, folded
in-package by ADR i).

## Usage

```tsx
import {
  Canvas,
  CanvasProvider,
  createCanvasStore,
  registerWhiteboard,
  Toolbar,
} from '@workspec/canvas';
import '@workspec/canvas/styles.css';

function WhiteboardPanel() {
  const [instance] = useState(() => {
    const inst = createCanvasStore({ persistenceKey: 'my-canvas-v1' });
    registerWhiteboard(inst); // sticky/text/draw/image/connector + hand/draw/text/sticky/connector/place tools
    return inst;
  });
  useEffect(() => () => instance.dispose(), [instance]);

  return (
    <CanvasProvider store={instance}>
      <Canvas backgroundVariant="dots" showMinimap />
      <Toolbar />
    </CanvasProvider>
  );
}
```

`<Canvas>` with no children renders the enterprise default layer stack (background when
`backgroundVariant` is set, connector/shape/selection layers, marquee, zoom controls, minimap when
`showMinimap`); pass children to compose a custom stack. `WhiteboardDemo` exports a full seeded
fixture of every base shape.

Two providers on one page are fully isolated — shapes, selection, history/undo, tools, hover and
timers all live on the instance (contract-tested; the enterprise engine was a module singleton).

## Store contract

`createCanvasStore(options)` returns a vanilla zustand v5 store augmented with the instance-scoped
registries (`tools`, `shapeUtils`, `hover`), the `host` seam, a `kindResolver` and `dispose()`.
Components read it through `useCanvasStore(selector)` — the call signature is identical to the
enterprise hook (`useCanvasStore()` for the whole state, `useCanvasStore(s => s.slice)` for a
slice); imperative `useCanvasStore.getState()` sites become `useCanvasInstance().getState()`.

Load-bearing store API (hosts depend on these; treat as stable):

- **`_setShapesRaw(shapes)`** — replace the shape record WITHOUT touching history. The live-drag
  write path, and the entry point host projections use to mint shapes from a remote model.
- **`_executeCommand(cmd)`** — run a pre-built `{do, undo, label}` command undoably (gesture
  commits, host edits).
- **`exportSnapshot()` / `loadSnapshot(snap)`** — serialise/restore `{version: 1, camera, shapes}`.
  `exportSnapshot` **excludes every shape with `meta.ephemeral`**: ephemeral shapes are pure
  projections of a remote model and must never leak into a persisted whiteboard snapshot.
- **`meta`** — host/module side-channel on every shape. `meta.ephemeral` is engine contract (see
  above); all other keys are yours.

## Persistence

Off by default. Pass `persistenceKey: 'some-key'` to persist to localStorage under that key
(debounced 800 ms, zod-validated on load, ephemeral shapes filtered via `exportSnapshot`). Hosts
with their own transport (REST/WS sync) leave it unset and drive `loadSnapshot`/`_setShapesRaw`
themselves. The enterprise's fixed `'workspec-canvas-v1'` key becomes this option on re-adoption.

## Host contract (`instance.host`)

The generic core of the enterprise C4 bridge; the full C4 extension (`C4CanvasHost`) ships with
`@workspec/c4-ui`. Every callback is optional, and the fallback rule is contract:

> A missing callback, or one returning `false`/`undefined`, means the host did **not** handle the
> mutation — the store falls through to its own local, undoable edit. Returning `true` means the
> host owned it (optimistic update + server write) and the store skips its default.

```ts
interface CanvasHost {
  // Fallback-semantics methods (boolean return is the contract above):
  deleteShapes?: (ids: ShapeId[]) => boolean;
  renameShape?: (id: ShapeId, label: string) => boolean;
  moveToContainer?: (ids: ShapeId[], containerId: string | null) => boolean;
  // Notify-style methods (no local fallback — the model is host-owned):
  autoLayout?: () => void; // re-arrange + persist (host-defined algorithm)
  createEdge?: (fromKey: string, toKey: string) => void; // connector-tool drag release; keys = ShapeUtil.connectorKey
  renameEdge?: (fromKey: string, toKey: string, label: string) => void; // fired AFTER the local optimistic label update
  placeNode?: (nodeType: string, point: Vec2) => void; // place tool drop (store.placementNodeType carries the palette pick)
}
```

Install with `instance.host = {...}` (and reset to `{}` on unmount, as the enterprise
`useC4Diagram` does).

## Extension seams

- **`instance.shapeUtils`** — the open shape-module registry: `register(util)` or
  `registerModule({ type, util, schema? })` (the zod schema is host-facing metadata for validating
  imported documents; the engine itself loads snapshots loosely). Capabilities replace every
  hard-coded per-type list the enterprise chrome carried: `isContextMenuSurface` (right-click
  container menu + auto-layout gate — was `'c4_boundary'`), `selfRendersSelection` (SelectionLayer
  opt-out — was connector/flowarrow/c4node/sticky/screen), `isConnectable`/`connectorKey` (the
  connector tool's endpoint set + host-model keys — legacy c4node/workflownode/diagram-node names
  still work as a fallback), `routedEdges` (connectors touching the shape route through the
  ORTHOGONAL elbow router instead of a straight Discovery tie — was the router's hard-coded
  routed-kind set) and `isRouteObstacle` (the router detours AROUND the shape — was
  `type === 'c4node'`; containers/boundaries deliberately leave it unset so edges may cross
  them), `isGroupContainer`/`containerTitle` (the context menu's move-to-group
  targets — was groupframe/diagram-group). For `routedEdges`/`isRouteObstacle` the legacy
  c4node/diagram-node/workflownode type names remain recognised when the capability is absent, so
  enterprise re-adoption works with bare utils.
- **`instance.tools`** — per-instance `Tool` registration, dispatched by `usePointerEvents` on
  `store.activeTool` (unregistered names fall back to the select tool, which every instance
  pre-registers). Keyboard tool keys (`v/h/s/t/d/l`) only fire for registered tools.
- **`kindResolver`** — maps a shape to the taxonomy `hiddenKinds` filters on (default: its `type`).
- **Viewport** — `<Canvas>` measures its own root and provides `CanvasViewportContext`; camera
  fit and (S2) culling read it. There are no `window.innerWidth` / `document.querySelector`
  reads in this package (test-enforced), so embedded panels fit/cull against their own rect.

## Conventions the engine relies on

- `data-canvas-ui` on any chrome element inside the canvas root makes pointer events pass it by.
- `data-export-exclude` marks non-document chrome (background grid, toolbar, zoom controls,
  minimap) for image-export filters: the engine stamps it on everything that is UI rather than
  content, and a host's DOM/raster exporter (enterprise: html-to-image's `filter`) must skip any
  element carrying it. The engine itself never reads it — the attribute IS the contract.
- Shape z-order is the fractional `index` string (`utils/fractional-index`), sorted ascending.
- `BaseShape.lensOffset` is the structured-lens glide delta: in `lens: 'structured'` a shape
  renders (and hit-tests/marquees, via `utils/lens`'s `effectivePosition`/`effectiveBounds`) at
  `x + lensOffset.dx / y + lensOffset.dy` WITHOUT touching the stored x/y, so the discovery-lens
  document geometry survives the round trip. Draw strokes are ghosted and unhittable in
  structured lens.
- Keyboard scoping is a `<Canvas shortcutScope>` policy (#118): `'window'` (default — enterprise
  parity, shortcuts work without focusing the canvas; one canvas per page) / `'root'` (bindings on
  the focusable canvas root, fire only with focus inside it — REQUIRED for multi-canvas pages) /
  `'none'`. Space-to-pan follows the same scope and only engages when a `hand` tool is registered.
- Sticky defaults (colour/font) and voice-memo playback position persist under fixed GLOBAL
  localStorage keys (`workspec-sticky-defaults`, `workspec-voice-pos-<shapeId>`) by design: they
  are per-viewer preferences/UI state, not document state, so they deliberately bypass the
  per-instance `persistenceKey` seam and are shared across canvases.
- Colour: every colour the package renders resolves from `@workspec/design` tokens; the two
  documented exceptions are `src/style/shape-defaults.ts` (persisted-document colour DATA +
  analog-paper constants) and `src/style/local-tokens.css` (`--c4-conn-default`), both enforced by
  `token-audit.test.ts`.

## Build

- `pnpm build` — the standalone library (`tsc --emitDeclarationOnly` + `tsup` + a Tailwind CSS
  compile into `dist/styles.css`), mirroring `packages/topology-ui`. The CSS entry is
  preflight-free and scoped under `.wsc-root` (the class the `<Canvas>` root carries).

## Testing

`pnpm test` (Vitest + jsdom + React Testing Library). The contract suites cover store-factory
isolation (two providers sharing nothing, per-instance history/undo), the CanvasHost fallback
semantics, `meta.ephemeral` snapshot filtering, persistence debounce, z-order/undo behaviour,
camera math, select-tool gestures (drag/marquee/resize/rotate/undo), the whiteboard tools, the
committed orthogonal-router route snapshot, container-rect culling + `hiddenKinds` filtering, the
open-registry proof (a dummy module registered beside the whiteboard set), the keyboard-scoping
policy, the token audit and the viewport seam (a source scan asserting no window/document global
reads).
