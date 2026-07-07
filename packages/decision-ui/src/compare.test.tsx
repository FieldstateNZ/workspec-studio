import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionCompare } from './compare.js';
import {
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  renderWithHost,
} from './test-utils.js';

function optHeadFor(name: string): HTMLElement {
  const nm = screen.getByText(name, { selector: '.ds-oh-nm' });
  const head = nm.closest('.ds-opthead');
  if (head === null) throw new Error(`no opthead for "${name}"`);
  return head as HTMLElement;
}

async function renderCompare(decide = false): Promise<ReturnType<typeof createHostingRepository>> {
  const repository = createHostingRepository();
  renderWithHost(<DecisionCompare decisionRef={HOSTING_DECISION_REF} />, {
    host: createTestHost(repository, { capabilities: { editCatalog: false, decide } }),
  });
  await screen.findByText('AKS', { selector: '.ds-oh-nm' });
  return repository;
}

describe('DecisionCompare — deltas, floor, recommendation', () => {
  it('marks the cheapest option as the floor and shows each option premium', async () => {
    await renderCompare();

    // App Service is the cheapest complete option ($16,104/yr) → the floor.
    expect(screen.getByText('▼ floor')).toBeInTheDocument();
    // AKS ($54,336.58) sits $38,232.58/yr above the floor.
    expect(screen.getByText('+$38,232.58/yr')).toBeInTheDocument();
    // ASE ($53,700) sits $37,596/yr above the floor.
    expect(screen.getByText('+$37,596/yr')).toBeInTheDocument();
    // The incomplete option (ACA) has no annual to compare.
    expect(screen.getByText('model incomplete')).toBeInTheDocument();
  });

  it('lands the cheapest badge on App Service and recommended on AKS', async () => {
    await renderCompare();
    expect(within(optHeadFor('App Service')).getByText('Cheapest')).toBeInTheDocument();
    expect(within(optHeadFor('AKS')).getByText('Recommended')).toBeInTheDocument();
  });

  it('summarises the engine recommendation deterministically in the banner', async () => {
    await renderCompare();
    const banner = document.querySelector('.ds-recobanner') as HTMLElement;
    expect(banner).not.toBeNull();
    const text = banner.textContent ?? '';
    expect(text).toContain('App Service'); // cheapest
    expect(text).toContain('$16,104'); // floor annual
    expect(text).toContain('AKS'); // recommended
    expect(text).toContain('$38,232.58'); // premium over floor
  });
});

describe('DecisionCompare — the pick row gates on capabilities.decide', () => {
  it('hides the pick row when decide is off', async () => {
    await renderCompare(false);
    expect(screen.queryByRole('button', { name: /^Select / })).toBeNull();
  });

  it('records the winner through the port when a column is selected', async () => {
    const user = userEvent.setup();
    const repository = await renderCompare(true);

    // Complete options are selectable; the incomplete one is disabled.
    expect(screen.getByRole('button', { name: 'Select Azure Container Apps' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select AKS' }));

    // The write went through the port with status + outcome.
    const stored = await repository.readDecision(HOSTING_DECISION_REF);
    expect(stored.metadata.status).toBe('decided');
    expect(stored.spec.outcome?.option).toBe('aks');
    expect((stored.spec.outcome?.rationale ?? '').length).toBeGreaterThan(0);

    // The AKS column now reads "Chosen · reopen".
    expect(await screen.findByRole('button', { name: /Chosen · reopen/ })).toBeInTheDocument();
  });
});
