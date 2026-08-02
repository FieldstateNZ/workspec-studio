import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasProvider, CanvasSpecContext, createCanvasStore } from '@workspec/canvas';
import type { CanvasStoreInstance, Shape, ShapeId } from '@workspec/canvas';
import type { ReactNode } from 'react';
import { registerC4, buildCanvasSpec } from './register-c4.js';
import { C4NodeComponent } from './shapes/c4-node-component.js';
import { C4BoundaryComponent } from './shapes/c4-boundary-component.js';
import { C4NodeStatusSlot } from './node-status-slot.js';
import type { C4BoundaryShape, C4NodeShape } from './c4-types.js';
import { nodeShapeId } from './project-model.js';

// Card-chrome fidelity checks (#119): kind-driven accent tokens, the
// derived .c4-el layer hooks, per-kind silhouettes, draft chip, status
// slot, external dashing — the DOM contract the enterprise chrome fixes.

function c4Node(nodeId: string, nodeType: string, overrides: Partial<C4NodeShape> = {}): C4NodeShape {
  return {
    id: nodeShapeId(nodeId),
    type: 'c4node',
    index: `a${nodeId}`,
    x: 0,
    y: 0,
    width: 300,
    height: 110,
    slug: nodeId,
    nodeType,
    label: nodeId,
    meta: { ephemeral: true, slug: nodeId },
    ...overrides,
  };
}

function mount(shapes: C4NodeShape[], children?: ReactNode): CanvasStoreInstance {
  const instance = createCanvasStore();
  registerC4(instance);
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
  render(
    <CanvasProvider store={instance}>
      <CanvasSpecContext.Provider value={buildCanvasSpec(undefined)}>
        {children ?? shapes.map((s) => <C4NodeComponent key={s.id} shape={s} isEditing={false} />)}
      </CanvasSpecContext.Provider>
    </CanvasProvider>,
  );
  return instance;
}

function cardOf(container: HTMLElement, label: string): HTMLElement {
  const el = [...container.querySelectorAll('.c4-el')].find((c) => c.textContent?.includes(label));
  if (!el) throw new Error(`card ${label} not found`);
  return el as HTMLElement;
}

describe('C4 node card chrome per kind', () => {
  test('each kind resolves its design-token accent into --el-accent-raw', () => {
    const kinds: [string, string][] = [
      ['sys', 'system'],
      ['act', 'actor'],
      ['web', 'container'],
      ['dom', 'domain'],
    ];
    const instance = mount(kinds.map(([id, kind]) => c4Node(id, kind)));
    void instance;
    const expects: Record<string, string> = {
      sys: 'var(--el-system)',
      act: 'var(--el-actor)',
      web: 'var(--el-container)',
      dom: 'var(--el-domain)',
    };
    for (const [id] of kinds) {
      const card = cardOf(document.body, id);
      expect(card.style.getPropertyValue('--el-accent-raw')).toBe(expects[id]);
    }
  });

  test('kind eyebrow labels render, with component aliased to Feature', () => {
    mount([c4Node('a', 'container'), c4Node('b', 'component'), c4Node('c', 'external-system')]);
    expect(screen.getByText('Container')).toBeDefined();
    expect(screen.getByText('Feature')).toBeDefined();
    expect(screen.getByText('External System')).toBeDefined();
  });

  test('external variant dashes the left accent border; box/pill radii differ', () => {
    mount([c4Node('ext', 'external-system'), c4Node('q', 'queue'), c4Node('sys', 'system')]);
    const ext = cardOf(document.body, 'ext');
    expect(ext.dataset['variant']).toBe('external');
    expect(ext.style.borderLeftStyle).toBe('dashed');
    // Queue renders as a pill (999 radius); box card at 10.
    expect(cardOf(document.body, 'q').style.borderRadius).toBe('999px');
    expect(cardOf(document.body, 'sys').style.borderRadius).toBe('10px');
  });

  test('cylinder kinds render the SVG silhouette frame instead of the box card', () => {
    const { container } = render(<span />); // anchor for querySelector scoping
    void container;
    mount([c4Node('db', 'database')]);
    const card = cardOf(document.body, 'db');
    // ShapeFrame draws ellipse + path silhouette.
    expect(card.querySelector('ellipse')).not.toBeNull();
    expect(card.querySelector('path')).not.toBeNull();
  });

  test('draft chip renders for drafted nodes; scope tint hook for isScope', () => {
    mount([c4Node('d', 'container', { drafted: true }), c4Node('s', 'system', { isScope: true })]);
    expect(screen.getByText('Draft')).toBeDefined();
    expect(cardOf(document.body, 's').dataset['scope']).toBe('focus');
  });

  test('the status slot renders host chrome inside the eyebrow row', () => {
    const instance = createCanvasStore();
    registerC4(instance);
    const shape = c4Node('pr', 'container');
    instance.getState()._setShapesRaw({ [shape.id]: shape } as Record<ShapeId, Shape>);
    render(
      <CanvasProvider store={instance}>
        <C4NodeStatusSlot.Provider
          value={(s) => <span data-testid="pr-chip">{`PR:${s.slug}`}</span>}
        >
          <C4NodeComponent shape={shape} isEditing={false} />
        </C4NodeStatusSlot.Provider>
      </CanvasProvider>,
    );
    expect(screen.getByTestId('pr-chip')).toHaveTextContent('PR:pr');
  });

  test('meta.dimmed applies the spotlight desaturation filter', () => {
    mount([c4Node('dim', 'container', { meta: { dimmed: true } })]);
    expect(cardOf(document.body, 'dim').style.filter).toContain('grayscale(0.7)');
  });
});

describe('C4 boundary chrome', () => {
  test('accent-derived fill/border + floating label tab', () => {
    const boundary: C4BoundaryShape = {
      id: 'c4_boundary' as ShapeId,
      type: 'c4boundary',
      index: 'a0',
      x: 0,
      y: 0,
      width: 600,
      height: 360,
      label: 'ACME System',
      accent: 'var(--el-system)',
    };
    const { container } = render(<C4BoundaryComponent shape={boundary} />);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.style.background).toContain('color-mix');
    expect(panel.style.background).toContain('7%');
    expect(panel.style.borderRadius).toBe('16px');
    expect(panel.style.pointerEvents).toBe('none');
    expect(screen.getByText('ACME System')).toBeDefined();
  });
});
