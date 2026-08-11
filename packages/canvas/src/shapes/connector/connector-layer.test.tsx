import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CanvasProvider } from '../../canvas-provider.js';
import { ConnectorLayer } from './connector-layer.js';
import { createCanvasStore } from '../../store/store.js';
import { registerWhiteboard } from '../../register-whiteboard.js';
import type { CanvasStoreInstance } from '../../store/store.types.js';
import type { Shape, ShapeId } from '../../types.js';
import { shapeFactory } from '../../test-helpers/factories.js';

// ConnectorLayer label-edit commit path (S2 debt, #119): the inline editor's
// optimistic local update + host.renameEdge bridge call, and the Escape
// revert.

function seeded(): { instance: CanvasStoreInstance; connectorId: ShapeId } {
  const instance = createCanvasStore();
  registerWhiteboard(instance);
  const a = shapeFactory({ type: 'sticky', x: 0, y: 0, width: 210, height: 150 });
  const b = shapeFactory({ type: 'sticky', x: 400, y: 300, width: 210, height: 150 });
  const c = shapeFactory({ type: 'connector', x: 0, y: 0, width: 0, height: 0 });
  const connector: Shape = {
    ...c,
    sourceShapeId: a.id,
    targetShapeId: b.id,
    edgeFrom: 'svc-a',
    edgeTo: 'svc-b',
    label: 'calls',
  };
  const record: Record<ShapeId, Shape> = {
    [a.id]: { ...a, text: '', color: 'yellow' },
    [b.id]: { ...b, text: '', color: 'blue' },
    [c.id]: connector,
  };
  instance.getState()._setShapesRaw(record);
  return { instance, connectorId: c.id };
}

describe('ConnectorLayer — label rendering', () => {
  test('renders the midpoint label chip for a Discovery connector', () => {
    const { instance } = seeded();
    render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );
    expect(screen.getByText('calls')).toBeDefined();
  });
});

describe('ConnectorLayer — low-zoom label LOD (#134)', () => {
  // Below 0.45 the pill provably cannot fit its corridor (it is a fixed
  // ~194x19 SCREEN-space chip in a PAGE-space gap that shrinks with the
  // camera), so it is dropped rather than counter-scaled. The TEXT is not
  // dropped — zoom is a viewport concern, not a content one.
  function renderAtZoom(zoom: number): HTMLElement {
    const { instance } = seeded();
    act(() => {
      instance.setState({ camera: { ...instance.getState().camera, zoom } });
    });
    const { container } = render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );
    return container;
  }

  test('at/above 0.45 the visible pill renders', () => {
    const container = renderAtZoom(0.45);
    const pill = [...container.querySelectorAll('div')].find(
      (d) => d.textContent === 'calls' && d.style.borderRadius !== '',
    );
    expect(pill).toBeDefined();
  });

  test('below 0.45 the pill is gone but the text remains for assistive tech', () => {
    // Mutation guard: deleting the zoom gate makes the first expectation
    // fail; swapping the visually-hidden span for `return null` makes the
    // second fail. Both halves of the ruling are pinned.
    const container = renderAtZoom(0.3);
    const pill = [...container.querySelectorAll('div')].find(
      (d) => d.textContent === 'calls' && d.style.borderRadius !== '',
    );
    expect(pill).toBeUndefined();
    expect(screen.getByText('calls')).toBeDefined();
  });

  test('an actively-edited label keeps its editor at any zoom', () => {
    const { instance, connectorId } = seeded();
    act(() => {
      instance.setState({ camera: { ...instance.getState().camera, zoom: 0.1 } });
      instance.getState().setEditing(connectorId);
    });
    const { container } = render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );
    expect(container.querySelector('input')).not.toBeNull();
  });
});

describe('ConnectorLayer — label-edit commit path', () => {
  test('Enter commits: optimistic updateShape + host.renameEdge with the slug keys', () => {
    const { instance, connectorId } = seeded();
    const renameEdge = vi.fn();
    instance.host = { renameEdge };
    act(() => {
      instance.getState().setEditing(connectorId);
    });
    render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );

    const input = screen.getByDisplayValue('calls');
    fireEvent.change(input, { target: { value: 'invokes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(instance.getState().shapes[connectorId]?.['label']).toBe('invokes');
    expect(renameEdge).toHaveBeenCalledWith('svc-a', 'svc-b', 'invokes');
    expect(instance.getState().editingId).toBeNull();
  });

  test('Escape reverts: no local write, no host call', () => {
    const { instance, connectorId } = seeded();
    const renameEdge = vi.fn();
    instance.host = { renameEdge };
    act(() => {
      instance.getState().setEditing(connectorId);
    });
    render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );

    const input = screen.getByDisplayValue('calls');
    fireEvent.change(input, { target: { value: 'scrapped' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(instance.getState().shapes[connectorId]?.['label']).toBe('calls');
    expect(renameEdge).not.toHaveBeenCalled();
    expect(instance.getState().editingId).toBeNull();
  });

  test('an unchanged commit is a no-op (no host call, no store write)', () => {
    const { instance, connectorId } = seeded();
    const renameEdge = vi.fn();
    instance.host = { renameEdge };
    act(() => {
      instance.getState().setEditing(connectorId);
    });
    render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );
    fireEvent.blur(screen.getByDisplayValue('calls'));
    expect(renameEdge).not.toHaveBeenCalled();
    expect(instance.getState().shapes[connectorId]?.['label']).toBe('calls');
  });
});
