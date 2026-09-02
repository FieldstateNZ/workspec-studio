import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from '@testing-library/user-event';

import { ThemeToggle } from './theme-toggle.js';

// ThemeToggle drives @workspec/design's shared setTheme()/useTheme(), so these
// tests exercise the real theming flow: aria-pressed must track the current
// theme, and a click must flip the document signal + persist the one
// preference key every WorkSpec surface reads.
afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('marks the button for the current theme as pressed', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the theme and persists the preference when a button is clicked', async () => {
    const user = userEvent.setup();
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Light' }));

    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(JSON.parse(localStorage.getItem('workspec.theme') ?? 'null')).toEqual({
      theme: 'light',
    });

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('uses a single icon control when the sidebar is collapsed', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle collapsed />);

    expect(screen.getByRole('button', { name: 'Theme: dark. Switch to light.' })).toHaveClass(
      'theme-toggle-collapsed',
    );
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
  });
});
