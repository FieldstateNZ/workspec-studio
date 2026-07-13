// Theme-as-prop is a hard rule (Site Review finding 03): the provider and
// everything under it must NEVER call `matchMedia` or touch storage — the
// host decides the theme and threads it down as a prop. This test renders
// the full app and asserts `matchMedia` is never invoked.

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CostApp } from './app.js';
import { CostStudioProvider } from './context.js';
import { createTestRepository } from './test-helpers/cost-estate.js';

function spyOnMatchMedia(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: spy });
  return spy;
}

describe('CostStudioProvider — theme is a prop, never matchMedia', () => {
  it('renders the provider alone without calling matchMedia', () => {
    const matchMediaSpy = spyOnMatchMedia();
    const { repository } = createTestRepository();
    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }} theme="light">
        <span>content</span>
      </CostStudioProvider>,
    );
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });

  it('renders the full CostApp (all four views mounted via tabs) without calling matchMedia', async () => {
    const matchMediaSpy = spyOnMatchMedia();
    const { repository, inventoryRef, attributionRef } = createTestRepository();
    const { findByText } = render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <CostApp inventoryRef={inventoryRef} attributionRef={attributionRef} />
      </CostStudioProvider>,
    );
    await findByText('Attribution coverage');
    await waitFor(() => expect(matchMediaSpy).not.toHaveBeenCalled());
  });

  it('applies the theme prop as inline tokens on .cost-root, defaulting to dark', () => {
    const { repository } = createTestRepository();
    const { container } = render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <span>content</span>
      </CostStudioProvider>,
    );
    const root = container.querySelector('.cost-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root).toHaveClass('dark');
  });
});
