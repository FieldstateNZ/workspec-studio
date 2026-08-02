import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhiteboardDemo } from './whiteboard-demo.js';

// #118 acceptance: the demo fixture renders ALL base shapes through the
// real provider + Canvas default stack + toolbar.

class ResizeObserverStub {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}

const RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1024,
  bottom: 768,
  width: 1024,
  height: 768,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  localStorage.clear();
});

describe('WhiteboardDemo (all-base-shapes fixture)', () => {
  test('renders every base shape type plus chrome', () => {
    const { container } = render(
      <div style={{ position: 'relative', width: 1024, height: 768 }}>
        <WhiteboardDemo />
      </div>,
    );

    // Sticky (title + body visible; both lens faces render, so use getAllBy*).
    expect(screen.getAllByText('Sticky').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Capture the idea').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Blue paper, torn edge/).length).toBeGreaterThanOrEqual(1);
    // Text shape.
    expect(screen.getByText('Loose text label')).toBeDefined();
    // Image shape (a real <img> with the data URL).
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('data:image/png');
    // Draw stroke: an SVG path inside the shape layer.
    expect(container.querySelector('svg path[stroke]')).not.toBeNull();
    // Connector: Discovery edge label chip renders through ConnectorLayer.
    expect(screen.getByText('relates to')).toBeDefined();
    // Chrome: toolbar buttons + zoom controls + minimap + background grid.
    expect(screen.getByLabelText('Select')).toBeDefined();
    expect(screen.getByLabelText('Sticky (right-click for defaults)')).toBeDefined();
    expect(screen.getByLabelText('Undo')).toBeDefined();
    expect(screen.getByLabelText('Zoom in')).toBeDefined();
    expect(screen.getByLabelText('Fit view')).toBeDefined();
    expect(container.querySelector('[data-canvas-root]')).not.toBeNull();
    // Background grid patterns (dots variant).
    expect(container.querySelectorAll('pattern').length).toBe(2);
  });

  test('undo/redo buttons reflect history state', () => {
    render(<WhiteboardDemo />);
    // Note: the text shape's auto-fit measure fires an updateShape on first
    // render (jsdom measures 0 → clamped 20), which IS a history entry —
    // enterprise behaviour. So undo may be enabled; redo (pointer at the
    // stack end) must not be.
    const redoButton = screen.getByLabelText('Redo');
    expect((redoButton as HTMLButtonElement).disabled).toBe(true);
  });
});
