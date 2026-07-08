import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS } from '@workspec/design';
import { ThemedRoot } from './themed-root.js';

const DARK = THEME_TOKENS['console-dark'];
const LIGHT = THEME_TOKENS['console-light'];

function renderThemed(theme: 'dark' | 'light'): HTMLElement {
  const { container } = render(
    <ThemedRoot theme={theme}>
      <span>content</span>
    </ThemedRoot>,
  );
  const root = container.querySelector('.c4-root');
  if (root === null) throw new Error('no .c4-root rendered');
  return root as HTMLElement;
}

describe('ThemedRoot — binds WorkSpec tokens from @workspec/design', () => {
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

  it('the two upstream themes are actually different', () => {
    expect(DARK['--bg']).not.toBe(LIGHT['--bg']);
    expect(DARK['--ink']).not.toBe(LIGHT['--ink']);
  });

  it('defaults to dark when no theme is given', () => {
    const { container } = render(
      <ThemedRoot>
        <span>content</span>
      </ThemedRoot>,
    );
    expect(container.querySelector('.c4-root')).toHaveAttribute('data-theme', 'dark');
  });
});
