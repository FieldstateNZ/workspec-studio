import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasProvider, CanvasSpecContext, createCanvasStore } from '@workspec/canvas';
import type { CanvasStoreInstance, Shape, ShapeId } from '@workspec/canvas';
import { A11yBridgeContext, a11yC4NodeShapeUtil } from '../../c4-canvas/a11y-node.js';
import type { A11yBridge } from '../../c4-canvas/a11y-node.js';
import type { PositionedNode } from '@workspec/c4-layout';
import { buildCanvasSpec, registerC4 } from '../register-c4.js';
import { C4NodeComponent } from './c4-node-component.js';
import type { C4NodeShape } from '../c4-types.js';
import { nodeShapeId } from '../project-model.js';

// The low-zoom LOD, wired end-to-end through the real card (#134). The
// pure ladder lives in c4-detail-level.test.ts; this suite proves the card
// actually READS it, that each tier drops the right chrome, and — the part
// that matters most — that dropping chrome never drops the a11y surface.

function c4Node(overrides: Partial<C4NodeShape> = {}): C4NodeShape {
  return {
    id: nodeShapeId('billing'),
    type: 'c4node',
    index: 'abilling',
    x: 0,
    y: 0,
    width: 300,
    height: 110,
    slug: 'billing',
    nodeType: 'container',
    label: 'Billing API',
    description: 'Handles invoicing and settlement.',
    drillable: true,
    meta: { ephemeral: true, slug: 'billing', artifactRefId: 'ref-1' },
    ...overrides,
  };
}

function mountAt(zoom: number, shape: C4NodeShape = c4Node()): CanvasStoreInstance {
  const instance = createCanvasStore();
  registerC4(instance);
  const record: Record<ShapeId, Shape> = { [shape.id]: shape };
  instance.getState()._setShapesRaw(record);
  instance.setState({ camera: { ...instance.getState().camera, zoom } });
  render(
    <CanvasProvider store={instance}>
      <CanvasSpecContext.Provider value={buildCanvasSpec(undefined)}>
        <C4NodeComponent shape={shape} isEditing={false} />
      </CanvasSpecContext.Provider>
    </CanvasProvider>,
  );
  return instance;
}

describe('C4 card level of detail', () => {
  test('full zoom keeps the whole card — description and drill chrome', () => {
    mountAt(1);
    expect(screen.getByText('Billing API')).toBeTruthy();
    expect(screen.getByText('Handles invoicing and settlement.')).toBeTruthy();
    expect(screen.getByLabelText('Drill into this')).toBeTruthy();
  });

  test('title tier (0.35 <= zoom < 0.6) keeps type + name, drops body chrome', () => {
    // Mutation guard: deleting the early return in C4NodeComponent brings
    // the description and the buttons back and fails both negatives.
    mountAt(0.5);
    expect(screen.getByText('Billing API')).toBeTruthy();
    expect(screen.getByText('Container')).toBeTruthy();
    expect(screen.queryByText('Handles invoicing and settlement.')).toBeNull();
    expect(screen.queryByLabelText('Drill into this')).toBeNull();
  });

  test('flat tier (zoom < 0.35) drops all text', () => {
    mountAt(0.2);
    expect(screen.queryByText('Billing API')).toBeNull();
    expect(screen.queryByText('Container')).toBeNull();
  });

  test('an inline-editing node is never collapsed — the editor must survive', () => {
    // A node named at low zoom would otherwise lose its input mid-keystroke.
    const shape = c4Node({ meta: { ephemeral: true, slug: 'billing', pending: true } });
    const instance = createCanvasStore();
    registerC4(instance);
    instance.getState()._setShapesRaw({ [shape.id]: shape });
    instance.setState({ camera: { ...instance.getState().camera, zoom: 0.2 } });
    const { container } = render(
      <CanvasProvider store={instance}>
        <CanvasSpecContext.Provider value={buildCanvasSpec(undefined)}>
          <C4NodeComponent shape={shape} isEditing />
        </CanvasSpecContext.Provider>
      </CanvasProvider>,
    );
    expect(container.querySelector('input')).not.toBeNull();
  });

  test('every tier keeps the card geometry, so hit-testing and edges still line up', () => {
    for (const zoom of [0.2, 0.5, 1]) {
      const { container, unmount } = render(<div />);
      unmount();
      void container;
      const instance = createCanvasStore();
      registerC4(instance);
      const shape = c4Node();
      instance.getState()._setShapesRaw({ [shape.id]: shape });
      instance.setState({ camera: { ...instance.getState().camera, zoom } });
      const view = render(
        <CanvasProvider store={instance}>
          <CanvasSpecContext.Provider value={buildCanvasSpec(undefined)}>
            <C4NodeComponent shape={shape} isEditing={false} />
          </CanvasSpecContext.Provider>
        </CanvasProvider>,
      );
      const el = view.container.querySelector('.c4-el') as HTMLElement | null;
      expect(el).not.toBeNull();
      expect(el?.style.width).toBe('300px');
      expect(el?.style.height).toBe('110px');
      view.unmount();
    }
  });
});

describe('LOD never reduces the accessibility surface', () => {
  // The load-bearing claim of the whole ruling: the node's accessible name
  // comes from the a11y wrapper's `aria-label`, which is built from MODEL
  // data (kind + title), not from the card's rendered text. So the name
  // survives even the flat tier, where the card renders no text at all.
  function mountWithA11y(zoom: number): void {
    const shape = c4Node();
    const node = { nodeId: 'billing', kind: 'container', title: 'Billing API' } as PositionedNode;
    const bridge: A11yBridge = {
      nodesById: new Map([['billing', node]]),
      isInteractive: () => true,
      onActivate: () => undefined,
    };
    const instance = createCanvasStore();
    registerC4(instance);
    instance.getState()._setShapesRaw({ [shape.id]: shape });
    instance.setState({ camera: { ...instance.getState().camera, zoom } });
    // The a11y-wrapped util is what C4Diagram registers over the base one
    // (c4-diagram.tsx:243) — that wrapper is the a11y surface under test.
    const Component = a11yC4NodeShapeUtil.Component;
    render(
      <CanvasProvider store={instance}>
        <CanvasSpecContext.Provider value={buildCanvasSpec(undefined)}>
          <A11yBridgeContext.Provider value={bridge}>
            <Component shape={shape} isEditing={false} />
          </A11yBridgeContext.Provider>
        </CanvasSpecContext.Provider>
      </CanvasProvider>,
    );
  }

  test.each([0.2, 0.5, 1])('accessible name survives at zoom %s', (zoom) => {
    mountWithA11y(zoom);
    const btn = screen.getByRole('button', { name: 'container: Billing API' });
    expect(btn).toBeTruthy();
    // Still focusable and still activatable at every tier.
    expect(btn.getAttribute('tabindex')).toBe('0');
  });
});
