import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS } from '@workspec/design';
import { TraceStudioProvider } from './context.js';
import { createMemoryRepository } from './host.js';
import { MetersBar } from './meters-bar.js';
import { RequirementsExplorer } from './requirements-explorer.js';
import { buildFixtureModel } from './test-helpers/trace-fixture.js';
import { TraceThemedRoot, useAmbientTheme } from './themed-root.js';

const DARK = THEME_TOKENS['console-dark'];
const LIGHT = THEME_TOKENS['console-light'];

function renderThemed(theme?: 'dark' | 'light'): HTMLElement {
  const { container } = render(
    <TraceThemedRoot theme={theme}>
      <span>content</span>
    </TraceThemedRoot>,
  );
  const root = container.querySelector('.trace-root');
  if (root === null) throw new Error('no .trace-root rendered');
  return root as HTMLElement;
}

describe('TraceThemedRoot — binds WorkSpec tokens from @workspec/design', () => {
  it('applies the console-dark token ramp inline on the root', () => {
    const root = renderThemed('dark');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.style.getPropertyValue('--bg')).toBe(DARK['--bg']);
    expect(root.style.getPropertyValue('--ink')).toBe(DARK['--ink']);
    expect(root.style.getPropertyValue('--accent')).toBe(DARK['--accent']);
  });

  it('applies the console-light token ramp inline on the root', () => {
    const root = renderThemed('light');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.style.getPropertyValue('--bg')).toBe(LIGHT['--bg']);
    expect(root.style.getPropertyValue('--ink')).toBe(LIGHT['--ink']);
  });

  it('carries the dual theme signal: attribute pair plus the dark class', () => {
    const dark = renderThemed('dark');
    expect(dark).toHaveAttribute('data-aesthetic', 'console');
    expect(dark).toHaveClass('dark');

    const light = renderThemed('light');
    expect(light).toHaveAttribute('data-aesthetic', 'console');
    expect(light).not.toHaveClass('dark');
  });

  it('defaults to dark when no theme is given and there is no ambient context', () => {
    expect(renderThemed(undefined)).toHaveAttribute('data-theme', 'dark');
  });

  it('the two upstream themes are actually different', () => {
    expect(DARK['--bg']).not.toBe(LIGHT['--bg']);
    expect(DARK['--ink']).not.toBe(LIGHT['--ink']);
  });
});

describe('TraceThemedRoot — ambient theme inheritance', () => {
  it('a nested TraceThemedRoot that would just inherit the ambient theme collapses to ONE root', () => {
    const { container } = render(
      <TraceThemedRoot theme="light">
        <TraceThemedRoot>
          <span>nested</span>
        </TraceThemedRoot>
      </TraceThemedRoot>,
    );
    // The inner root emits a plain fragment rather than a second identical
    // `.trace-root` — no redundant wrapper, no duplicated inline token map.
    const roots = container.querySelectorAll('.trace-root');
    expect(roots).toHaveLength(1);
    expect(roots[0]).toHaveAttribute('data-theme', 'light');
    // …and the nested content still renders under that single root.
    expect(screen.getByText('nested')).toBeInTheDocument();
  });

  it('an explicit theme prop that DIFFERS from the ambient one still emits its own root', () => {
    const { container } = render(
      <TraceThemedRoot theme="light">
        <TraceThemedRoot theme="dark">
          <span>nested</span>
        </TraceThemedRoot>
      </TraceThemedRoot>,
    );
    // A genuine override needs its own wrapper carrying the dark token map, so
    // here — and only here — two roots are correct.
    const roots = container.querySelectorAll('.trace-root');
    expect(roots).toHaveLength(2);
    expect(roots[0]).toHaveAttribute('data-theme', 'light');
    expect(roots[1]).toHaveAttribute('data-theme', 'dark');
  });

  it('useAmbientTheme returns null outside of any TraceThemedRoot', () => {
    let observed: string | null = 'unset';
    function Probe(): null {
      observed = useAmbientTheme();
      return null;
    }
    render(<Probe />);
    expect(observed).toBeNull();
  });
});

describe('TraceThemedRoot — exactly one .trace-root, composed and standalone', () => {
  it('a self-wrapping view composed under TraceStudioProvider yields EXACTLY one .trace-root', () => {
    const host = {
      repository: createMemoryRepository({ model: buildFixtureModel() }),
      capabilities: { generateSkeletons: false },
    };
    // The provider wraps once; MetersBar and RequirementsExplorer EACH self-wrap
    // again — yet the composed tree must carry a single root, not three.
    const { container } = render(
      <TraceStudioProvider host={host} theme="dark">
        <MetersBar model={buildFixtureModel()} />
        <RequirementsExplorer model={buildFixtureModel()} />
      </TraceStudioProvider>,
    );
    expect(container.querySelectorAll('.trace-root')).toHaveLength(1);
    expect(container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'dark');
  });

  it('a view mounted standalone still emits its own single .trace-root', () => {
    const { container } = render(<MetersBar model={buildFixtureModel()} theme="light" />);
    expect(container.querySelectorAll('.trace-root')).toHaveLength(1);
    expect(container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'light');
  });
});
