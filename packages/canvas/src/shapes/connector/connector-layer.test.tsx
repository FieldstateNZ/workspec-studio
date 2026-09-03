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

function seeded(routed = false): { instance: CanvasStoreInstance; connectorId: ShapeId } {
  const instance = createCanvasStore();
  registerWhiteboard(instance);
  const endpointType = routed ? 'c4node' : 'sticky';
  const a = shapeFactory({ type: endpointType, x: 0, y: 0, width: 210, height: 150 });
  const b = shapeFactory({ type: endpointType, x: 400, y: 300, width: 210, height: 150 });
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

  test('shows the full connection description when its label is hovered', () => {
    const { instance } = seeded(true);
    render(
      <CanvasProvider store={instance}>
        <ConnectorLayer />
      </CanvasProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Connection: calls' });
    expect(trigger).not.toHaveTextContent('calls');
    fireEvent.pointerEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('calls');
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
