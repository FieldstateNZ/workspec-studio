// @vitest-environment jsdom
//
// The shell chrome (A1, #131 — owner-review rounds 1 and 2): top bar
// carrying the diagram NAV + theme toggle, over a full-bleed main with the
// breadcrumb floating on the canvas. These tests pin the shell's OWN
// behaviours — the crumb's contract lives in diagram-crumb.test.tsx, the
// explorer's in @workspec/c4-ui's suite.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Shell } from './shell.js';
import type { ShellDiagramItem } from './shell.js';
import type { DiagramCrumbFrame } from './diagram-crumb.js';

const DIAGRAMS: readonly ShellDiagramItem[] = [
  { slug: 'system-context', label: '1 · Context' },
  { slug: 'containers', label: '2 · Container' },
];

const CRUMB: readonly DiagramCrumbFrame[] = [
  { slug: 'system-context', title: 'System Context', type: 'c4-context' },
];

function renderShell(
  overrides: Partial<Parameters<typeof Shell>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <Shell
      theme="dark"
      onThemeChange={() => undefined}
      dir="/repo/.workspec"
      diagrams={DIAGRAMS}
      selectedSlug="system-context"
      onSelectDiagram={() => undefined}
      crumbStack={CRUMB}
      onCrumb={() => undefined}
      {...overrides}
    >
      <div data-testid="page-content">canvas goes here</div>
    </Shell>,
  );
}

describe('Shell — no diagrams sidebar (owner ruling: don’t conflate Diagrams with the C4 page)', () => {
  it('renders NO sidebar, no diagram list panel, and no collapse control', () => {
    renderShell();

    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /expand sidebar/i })).toBeNull();
  });
});

describe('Shell — diagram switching lives in the TOP BAR nav, not on the canvas', () => {
  it('renders one nav entry per diagram, using the deriveLevelTabs labels', () => {
    renderShell();

    const nav = screen.getByRole('navigation', { name: 'Diagrams' });
    expect(within(nav).getByRole('button', { name: '1 · Context' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '2 · Container' })).toBeInTheDocument();
  });

  it('the nav is APP chrome — it sits in the top bar, never floating over the canvas', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Diagrams' });
    expect(nav.closest('.c4sh-topbar')).not.toBeNull();
    expect(nav.closest('.c4sh-main')).toBeNull();
  });

  it('marks the shown diagram current — and only it', () => {
    renderShell({ selectedSlug: 'containers' });

    const nav = screen.getByRole('navigation', { name: 'Diagrams' });
    expect(within(nav).getByRole('button', { name: '2 · Container' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: '1 · Context' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('clicking a nav entry raises onSelectDiagram with its slug', () => {
    const onSelectDiagram = vi.fn();
    renderShell({ onSelectDiagram });

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));

    expect(onSelectDiagram).toHaveBeenCalledExactlyOnceWith('containers');
  });

  it('renders no nav at all when nothing was discovered', () => {
    renderShell({ diagrams: [], crumbStack: [] });
    expect(screen.queryByRole('navigation', { name: 'Diagrams' })).toBeNull();
  });
});

describe('Shell — the breadcrumb floats on the canvas', () => {
  it('mounts the crumb inside main, showing the diagram on screen as a disabled label', () => {
    renderShell();

    const crumb = screen.getByRole('button', { name: 'System Context' });
    expect(crumb.closest('.c4sh-main')).not.toBeNull();
    expect(crumb.closest('.c4sh-topbar')).toBeNull();
    expect(crumb).toBeDisabled();
    // The page content is un-squeezed by it — floating chrome, not a column.
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('walking the crumb raises onCrumb with the frame index', () => {
    const onCrumb = vi.fn();
    renderShell({
      crumbStack: [
        { slug: 'system-context', title: 'System Context', type: 'c4-context' },
        { slug: 'containers', title: 'Container View', type: 'c4-container' },
      ],
      onCrumb,
    });

    fireEvent.click(screen.getByRole('button', { name: 'System Context' }));

    expect(onCrumb).toHaveBeenCalledExactlyOnceWith(0);
  });
});

describe('Shell — theme toggle + theme binding', () => {
  it('binds the dual theme signal on the root (data-theme + .dark), the ThemedRoot convention', () => {
    const { container } = renderShell({ theme: 'dark' });
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root).toHaveAttribute('data-aesthetic', 'console');
  });

  it('light theme drops the .dark class and flips data-theme', () => {
    const { container } = renderShell({ theme: 'light' });
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('the toggle presses the active theme and raises onThemeChange with the picked one', () => {
    const onThemeChange = vi.fn();
    renderShell({ theme: 'dark', onThemeChange });

    const group = screen.getByRole('group', { name: 'Theme' });
    expect(within(group).getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(within(group).getByRole('button', { name: 'Light' }));
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('light');
  });

  it('lives in the TOP BAR, not over the canvas — reachable no matter what the canvas shows', () => {
    renderShell();
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(group.closest('.c4sh-topbar')).not.toBeNull();
    expect(group.closest('.c4sh-main')).toBeNull();
  });
});

describe('Shell — write-error banner (A2’s onWriteError surface)', () => {
  it('shows nothing while there is no error', () => {
    renderShell();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a failed write verbatim as a dismissible alert', () => {
    const onDismissWriteError = vi.fn();
    renderShell({ writeError: '409 diagram node not found', onDismissWriteError });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('409 diagram node not found');

    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss write error' }));
    expect(onDismissWriteError).toHaveBeenCalledOnce();
  });
});

describe('Shell — top bar', () => {
  it('shows the brand and the served working directory', () => {
    renderShell();
    expect(screen.getByText(/C4 Studio/)).toBeInTheDocument();
    expect(screen.getByText('/repo/.workspec')).toBeInTheDocument();
  });
});

describe('Shell — top bar overflow floor (narrow viewports)', () => {
  /**
   * The defect: below ~450px the brand block was unshrinkable, so the bar's
   * content grew past the viewport and the theme toggle rendered off the
   * right edge with `document.documentElement.scrollWidth` still at the
   * viewport width — unreachable, not merely clipped.
   *
   * jsdom does no layout, so the width itself cannot be measured here. It
   * also refuses to parse `shell.css` at all (`document.styleSheets[0]`
   * comes back with ZERO rules for this file), so the cascade route is
   * closed too. What is left — and what still dies if the fix is reverted —
   * is asserting the shipped stylesheet's own declarations plus the DOM
   * ordering that makes them meaningful. The real-viewport check belongs in
   * the served-page Playwright suite (A4).
   */
  // Read from disk, not imported: vitest stubs CSS modules (`css: false`),
  // so even `?raw` resolves to an empty string here. `process.cwd()` is the
  // package root — vitest roots itself at its config file's directory.
  const shellCss = readFileSync(join(process.cwd(), 'client/shell.css'), 'utf8');

  function declarationsFor(selector: string): string {
    const at = shellCss.indexOf(`\n${selector} {`);
    expect(at, `no \`${selector}\` rule in shell.css`).toBeGreaterThanOrEqual(0);
    const open = shellCss.indexOf('{', at);
    return shellCss.slice(open + 1, shellCss.indexOf('}', open));
  }

  it('the bar carries an overflow escape and a shrinkable brand', () => {
    // Content that cannot fit scrolls INSIDE the bar rather than off it.
    expect(declarationsFor('.c4sh-topbar')).toContain('overflow-x: auto');
    // …and it rarely has to, because the brand yields space first. A flex
    // item only shrinks past its content when `min-width` is 0.
    expect(declarationsFor('.c4sh-brand')).toContain('min-width: 0');
    expect(declarationsFor('.c4sh-wmk')).toContain('text-overflow: ellipsis');
  });

  it('keeps the theme toggle inside the bar, after the diagram nav', () => {
    const { container } = renderShell();
    const bar = container.querySelector('.c4sh-topbar');
    expect(bar).not.toBeNull();

    const toggle = within(bar as HTMLElement).getByRole('button', { name: /light/i });
    expect(toggle).toBeInTheDocument();
    // Trailing slot: the nav precedes it, so the nav's own internal scroll
    // (`.c4sh-nav { overflow-x: auto }`) absorbs a many-diagram tree instead
    // of pushing the toggle along the bar.
    const nav = within(bar as HTMLElement).getByRole('navigation', { name: 'Diagrams' });
    expect(nav.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
