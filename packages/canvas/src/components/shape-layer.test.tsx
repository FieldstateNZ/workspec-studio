import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { ShapeLayer } from './shape-layer.js';
import { CanvasProvider } from '../canvas-provider.js';
import { CanvasViewportContext, type CanvasViewport } from '../canvas-viewport.js';
import { createCanvasStore } from '../store/store.js';
import type { CanvasStoreInstance, CanvasStoreOptions } from '../store/store.types.js';
import type { Shape, ShapeId } from '../types.js';
import { boxShapeUtilFactory, shapeFactory } from '../test-helpers/factories.js';

// ShapeLayer S2 contracts (#118): container-rect culling (never the
// window) and the LIVE hiddenKinds × kindResolver wiring (S1 debt).

const Probe: FC<{ shape: Shape; isEditing: boolean }> = ({ shape }) => (
  <output aria-label={`shape-${shape.id}`} />
);

function instanceWith(shapes: Shape[], options: CanvasStoreOptions = {}): CanvasStoreInstance {
  const instance = createCanvasStore(options);
  instance.shapeUtils.register(boxShapeUtilFactory({ Component: Probe }));
  instance.shapeUtils.register(boxShapeUtilFactory({ type: 'note', Component: Probe }));
  instance.shapeUtils.register(boxShapeUtilFactory({ type: 'connector', Component: Probe }));
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
  return instance;
}

function renderLayer(instance: CanvasStoreInstance, viewport?: CanvasViewport): void {
  const inner: ReactNode = viewport ? (
    <CanvasViewportContext.Provider value={viewport}>
      <ShapeLayer />
    </CanvasViewportContext.Provider>
  ) : (
    <ShapeLayer />
  );
  render(<CanvasProvider store={instance}>{inner}</CanvasProvider>);
}

const VIEWPORT: CanvasViewport = { width: 800, height: 600, getRect: () => null };

describe('ShapeLayer — container-rect culling', () => {
  test('culls against the measured canvas rect with the 400px margin', () => {
    const inside = shapeFactory({ x: 100, y: 100 });
    const nearEdge = shapeFactory({ x: 800 + 350, y: 100 }); // inside the margin band
    const farOut = shapeFactory({ x: 800 + 401, y: 100 }); // beyond margin
    const instance = instanceWith([inside, nearEdge, farOut]);
    renderLayer(instance, VIEWPORT);

    expect(screen.getByLabelText(`shape-${inside.id}`)).toBeDefined();
    expect(screen.getByLabelText(`shape-${nearEdge.id}`)).toBeDefined();
    expect(screen.queryByLabelText(`shape-${farOut.id}`)).toBeNull();
  });

  test('camera pan/zoom shifts the culling window', () => {
    const shape = shapeFactory({ x: 5000, y: 5000 });
    const instance = instanceWith([shape]);
    instance.getState().setCamera({ x: 4900, y: 4900, zoom: 1 });
    renderLayer(instance, VIEWPORT);
    expect(screen.getByLabelText(`shape-${shape.id}`)).toBeDefined();
  });

  test('no measured viewport → no culling (render everything, never guess a window size)', () => {
    const farOut = shapeFactory({ x: 99999, y: 99999 });
    const instance = instanceWith([farOut]);
    renderLayer(instance);
    expect(screen.getByLabelText(`shape-${farOut.id}`)).toBeDefined();
  });

  test('connectors are never culled (their stored rect lags live geometry)', () => {
    const connector = shapeFactory({ type: 'connector', x: 99999, y: 99999 });
    const instance = instanceWith([connector]);
    renderLayer(instance, VIEWPORT);
    expect(screen.getByLabelText(`shape-${connector.id}`)).toBeDefined();
  });
});

describe('ShapeLayer — hiddenKinds via kindResolver (S1 debt wiring)', () => {
  test('filters by the instance-injected kind taxonomy, not shape type', () => {
    const artifactNote = shapeFactory({ x: 0, y: 0, meta: { kind: 'note' } });
    const artifactCard = shapeFactory({ x: 200, y: 0, meta: { kind: 'card' } });
    const instance = instanceWith([artifactNote, artifactCard], {
      kindResolver: (s) => ((s.meta as { kind?: string } | undefined)?.kind ?? s.type),
    });
    instance.getState().setHiddenKinds(new Set(['note']));
    renderLayer(instance, VIEWPORT);

    expect(screen.queryByLabelText(`shape-${artifactNote.id}`)).toBeNull();
    expect(screen.getByLabelText(`shape-${artifactCard.id}`)).toBeDefined();
  });

  test('the default resolver filters under the shape type', () => {
    const note = shapeFactory({ type: 'note', x: 0, y: 0 });
    const box = shapeFactory({ x: 200, y: 0 });
    const instance = instanceWith([note, box]);
    instance.getState().setHiddenKinds(new Set(['note']));
    renderLayer(instance, VIEWPORT);

    expect(screen.queryByLabelText(`shape-${note.id}`)).toBeNull();
    expect(screen.getByLabelText(`shape-${box.id}`)).toBeDefined();
  });
});
