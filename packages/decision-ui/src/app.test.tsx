import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionApp } from './app.js';
import {
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  renderWithHost,
} from './test-utils.js';

const FULL_HOST = { capabilities: { editCatalog: true, decide: true } };

async function renderApp(): Promise<void> {
  renderWithHost(<DecisionApp decisionRef={HOSTING_DECISION_REF} />, {
    host: createTestHost(createHostingRepository(), FULL_HOST),
  });
  await screen.findByText('AKS', { selector: '.ds-opt-title' });
}

describe('DecisionApp — the four views are navigable', () => {
  it('switches Options → Compare → Catalog → ADR via the segmented nav', async () => {
    const user = userEvent.setup();
    await renderApp();

    // Options (Workspace) is the default view.
    expect(screen.getByText('AKS', { selector: '.ds-opt-title' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Compare/ }));
    expect(await screen.findByText('▼ floor')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Catalog/ }));
    expect(await screen.findByText('SKUs', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByLabelText('D8s v5 price')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /ADR/ }));
    expect(await screen.findByText('Considered options')).toBeInTheDocument();
  });

  it('routes the workspace Compare button through the app navigate override', async () => {
    const user = userEvent.setup();
    await renderApp();

    // The workspace header exposes a Compare button because the app injects navigate.
    await user.click(screen.getByRole('button', { name: /Compare/ }));
    expect(await screen.findByText('▼ floor')).toBeInTheDocument();
  });
});
