import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DecisionStudioProvider } from './context.js';
import { DARK_THEME, LIGHT_THEME } from './themes.js';
import { createHostingRepository, createTestHost } from './test-utils.js';

function renderThemed(theme: 'dark' | 'light'): HTMLElement {
  const { container } = render(
    <DecisionStudioProvider host={createTestHost(createHostingRepository())} theme={theme}>
      <span>content</span>
    </DecisionStudioProvider>,
  );
  const root = container.querySelector('.ds-root');
  if (root === null) throw new Error('no .ds-root rendered');
  return root as HTMLElement;
}

describe('theming — data-theme swaps the --ds-* tokens', () => {
  it('applies the dark token ramp on the root', () => {
    const root = renderThemed('dark');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.style.getPropertyValue('--ds-bg')).toBe(DARK_THEME['--ds-bg']);
    expect(root.style.getPropertyValue('--ds-ink')).toBe(DARK_THEME['--ds-ink']);
    expect(root.style.getPropertyValue('--ds-accent')).toBe(DARK_THEME['--ds-accent']);
  });

  it('applies the light token ramp on the root', () => {
    const root = renderThemed('light');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.style.getPropertyValue('--ds-bg')).toBe(LIGHT_THEME['--ds-bg']);
    expect(root.style.getPropertyValue('--ds-ink')).toBe(LIGHT_THEME['--ds-ink']);
  });

  it('the two themes are actually different', () => {
    expect(DARK_THEME['--ds-bg']).not.toBe(LIGHT_THEME['--ds-bg']);
    expect(DARK_THEME['--ds-ink']).not.toBe(LIGHT_THEME['--ds-ink']);
    expect(DARK_THEME['--ds-on-accent']).not.toBe(LIGHT_THEME['--ds-on-accent']);
  });

  it('defaults to dark when no theme is given', () => {
    const { container } = render(
      <DecisionStudioProvider host={createTestHost(createHostingRepository())}>
        <span>content</span>
      </DecisionStudioProvider>,
    );
    expect(container.querySelector('.ds-root')).toHaveAttribute('data-theme', 'dark');
  });
});
