// @vitest-environment jsdom
//
// The on-canvas breadcrumb (A1 owner ruling, round 2). These pin what the
// crumb ACTUALLY does — which is walk back up a drill stack, never switch
// diagrams — and pin the structural details taken from enterprise
// `C4Toolbar.tsx:158-201`, so a later "improvement" that drifts from it
// fails here.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiagramCrumb } from './diagram-crumb.js';
import type { DiagramCrumbFrame } from './diagram-crumb.js';

const CONTEXT: DiagramCrumbFrame = {
  slug: 'system-context',
  title: 'System Context',
  type: 'c4-context',
};
const CONTAINER: DiagramCrumbFrame = {
  slug: 'containers',
  title: 'Container View',
  type: 'c4-container',
};
const COMPONENT: DiagramCrumbFrame = {
  slug: 'billing',
  title: 'Billing components',
  type: 'c4-component',
};

describe('DiagramCrumb — today’s single-frame stack (enterprise at depth 1)', () => {
  it('renders one DISABLED button naming the diagram on screen', () => {
    render(<DiagramCrumb stack={[CONTEXT]} onCrumb={() => undefined} />);

    const crumb = screen.getByRole('button', { name: 'System Context' });
    expect(crumb).toBeDisabled();
    // The last frame takes the foreground treatment (enterprise :175-178).
    expect(crumb).toHaveClass('c4sh-crumb-btn-current');
  });

  it('carries enterprise’s LEVEL_LABEL tooltip: `${level} — ${title}`', () => {
    render(<DiagramCrumb stack={[CONTEXT]} onCrumb={() => undefined} />);
    expect(screen.getByRole('button', { name: 'System Context' })).toHaveAttribute(
      'title',
      'Context — System Context',
    );
  });

  it('never invents a level for a non-C4 diagram type', () => {
    render(
      <DiagramCrumb
        stack={[{ slug: 'flow', title: 'Order Flow', type: 'sequence' }]}
        onCrumb={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Order Flow' })).toHaveAttribute(
      'title',
      'Diagram — Order Flow',
    );
  });

  it('renders no separator for a single frame', () => {
    const { container } = render(<DiagramCrumb stack={[CONTEXT]} onCrumb={() => undefined} />);
    expect(container.querySelectorAll('.c4sh-crumb-sep')).toHaveLength(0);
  });

  it('renders nothing at all for an empty stack', () => {
    const { container } = render(<DiagramCrumb stack={[]} onCrumb={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DiagramCrumb — the crumb does NOT switch diagrams', () => {
  it('clicking the current frame raises nothing — it is disabled', () => {
    const onCrumb = vi.fn();
    render(<DiagramCrumb stack={[CONTEXT]} onCrumb={onCrumb} />);

    fireEvent.click(screen.getByRole('button', { name: 'System Context' }));

    expect(onCrumb).not.toHaveBeenCalled();
  });

  it('exposes NO dropdown affordance — switching lives in the nav, not here', () => {
    render(<DiagramCrumb stack={[CONTEXT]} onCrumb={() => undefined} />);

    // Enterprise's crumb is plain buttons: no popup to describe, so no
    // listbox/menu ARIA (and none must creep back in).
    const crumb = screen.getByRole('button', { name: 'System Context' });
    expect(crumb).not.toHaveAttribute('aria-haspopup');
    expect(crumb).not.toHaveAttribute('aria-expanded');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
    // …and it lists only the current frame, never the other diagrams.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('DiagramCrumb — a real trail, once A3 lands drillDown', () => {
  it('renders every frame with a separator between each, only the last disabled', () => {
    const { container } = render(
      <DiagramCrumb stack={[CONTEXT, CONTAINER, COMPONENT]} onCrumb={() => undefined} />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'System Context',
      'Container View',
      'Billing components',
    ]);
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeEnabled();
    expect(buttons[2]).toBeDisabled();
    // One separator per frame after the first (enterprise :166).
    expect(container.querySelectorAll('.c4sh-crumb-sep')).toHaveLength(2);
  });

  it('clicking an ancestor walks back up to THAT index', () => {
    const onCrumb = vi.fn();
    render(<DiagramCrumb stack={[CONTEXT, CONTAINER, COMPONENT]} onCrumb={onCrumb} />);

    fireEvent.click(screen.getByRole('button', { name: 'Container View' }));
    expect(onCrumb).toHaveBeenCalledExactlyOnceWith(1);

    onCrumb.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'System Context' }));
    expect(onCrumb).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('each ancestor keeps its own level tooltip', () => {
    render(<DiagramCrumb stack={[CONTEXT, CONTAINER]} onCrumb={() => undefined} />);
    expect(screen.getByRole('button', { name: 'System Context' })).toHaveAttribute(
      'title',
      'Context — System Context',
    );
    expect(screen.getByRole('button', { name: 'Container View' })).toHaveAttribute(
      'title',
      'Container — Container View',
    );
  });
});
