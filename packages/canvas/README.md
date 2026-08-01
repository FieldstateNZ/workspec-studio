# @workspec/canvas

Host-agnostic infinite-canvas engine for WorkSpec surfaces — a per-instance store factory with
undo/redo command history, camera/pointer/keyboard hooks, fractional-index z-order, and open
shape/tool/host extension seams. Ported from the WorkSpec enterprise canvas engine (epic #116);
this is the **S1 engine-core surface**: shape components, the full toolset and chrome (layers,
minimap, toolbar, context menu) arrive in S2, and C4 semantics layer on via `@workspec/canvas-c4`
(S3).

## Usage

```tsx
import { Canvas, CanvasProvider, createCanvasStore, useCanvasStore } from '@workspec/canvas';
import '@workspec/canvas/styles.css';

function DiagramPanel() {
  const [instance] = useState(() => createCanvasStore({ persistenceKey: 'my-canvas-v1' }));
  useEffect(() => () => instance.dispose(), [instance]);

  return (
    <CanvasProvider store={instance}>
      <Canvas>{/* S2 layer components compose here */}</Canvas>
    </CanvasProvider>
  );
}
```

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

The generic core of the enterprise C4 bridge; the full C4 extension ships with
`@workspec/canvas-c4`. Every callback is optional, and the fallback rule is contract:

> A missing callback, or one returning `false`/`undefined`, means the host did **not** handle the
> mutation — the store falls through to its own local, undoable edit. Returning `true` means the
> host owned it (optimistic update + server write) and the store skips its default.

```ts
interface CanvasHost {
  deleteShapes?: (ids: ShapeId[]) => boolean;
  renameShape?: (id: ShapeId, label: string) => boolean;
  moveToContainer?: (ids: ShapeId[], containerId: string | null) => boolean;
  autoLayout?: () => void;
}
```

Install with `instance.host = {...}` (and reset to `{}` on unmount, as the enterprise
`useC4Diagram` does).

## Extension seams

- **`instance.shapeUtils`** — per-type `ShapeUtil` registration (bounds, hit-test, capabilities,
  Component). S1 defines the contract; concrete utils and the module-registration surface land in
  S2. The `isContextMenuSurface` capability replaces the enterprise's hard-coded `'c4_boundary'`
  right-click gate.
- **`instance.tools`** — per-instance `Tool` registration, dispatched by `usePointerEvents` on
  `store.activeTool` (unregistered names fall back to the select tool, which every instance
  pre-registers). Keyboard tool keys (`v/h/s/t/d/l`) only fire for registered tools.
- **`kindResolver`** — maps a shape to the taxonomy `hiddenKinds` filters on (default: its `type`).
- **Viewport** — `<Canvas>` measures its own root and provides `CanvasViewportContext`; camera
  fit and (S2) culling read it. There are no `window.innerWidth` / `document.querySelector`
  reads in this package (test-enforced), so embedded panels fit/cull against their own rect.

## Conventions the engine relies on

- `data-canvas-ui` on any chrome element inside the canvas root makes pointer events pass it by.
- Shape z-order is the fractional `index` string (`utils/fractional-index`), sorted ascending.
- Keyboard shortcuts are window-scoped (enterprise behaviour): a page mounting two canvases
  should render only one `<Canvas>`'s shortcuts as authoritative or scope focus itself.

## Build

- `pnpm build` — the standalone library (`tsc --emitDeclarationOnly` + `tsup` + a Tailwind CSS
  compile into `dist/styles.css`), mirroring `packages/topology-ui`. The CSS entry is
  preflight-free and scoped under `.wsc-root` (the class the `<Canvas>` root carries).

## Testing

`pnpm test` (Vitest + jsdom + React Testing Library). The contract suites cover store-factory
isolation (two providers sharing nothing, per-instance history/undo), the CanvasHost fallback
semantics, `meta.ephemeral` snapshot filtering, persistence debounce, z-order/undo behaviour,
camera math, select-tool gestures and the viewport seam (including a source scan asserting no
window/document global reads).
