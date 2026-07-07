import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionStudioProvider } from './context.js';
import { DecisionWorkspace } from './workspace.js';
import {
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  renderWithHost,
} from './test-utils.js';

// Locate an option card by its (exact) option name. `getByText` compares only an
// element's direct text nodes, so the name text node matches even though the
// title also carries a tag chip and badges.
function cardFor(name: string): HTMLElement {
  const title = screen.getByText(name);
  const card = title.closest('.ds-opt');
  if (card === null) throw new Error(`no card for "${name}"`);
  return card as HTMLElement;
}

function headerEnvValue(card: HTMLElement, env: string): string | null {
  for (const cell of card.querySelectorAll('.ds-opt-cost .ds-env')) {
    if (cell.querySelector('.ds-k')?.textContent === env) {
      return cell.querySelector('.ds-v')?.textContent ?? null;
    }
  }
  return null;
}

function headerAnnual(card: HTMLElement): string | null {
  return card.querySelector('.ds-opt-annual .ds-v')?.textContent ?? null;
}

async function renderHostingWorkspace(): Promise<void> {
  renderWithHost(<DecisionWorkspace decisionRef={HOSTING_DECISION_REF} />, {
    host: createTestHost(createHostingRepository()),
  });
  // Wait for the async repository read to resolve.
  await screen.findByText('AKS');
}

describe('DecisionWorkspace — hosting-platform golden numbers', () => {
  it('renders per-env costs matching the engine golden output', async () => {
    await renderHostingWorkspace();

    // App Service dev = $187.20 (P1v3 scheduled to business hours + flat lines).
    const appsvc = cardFor('App Service');
    expect(headerEnvValue(appsvc, 'dev')).toBe('$187.20');

    // AKS annual = $54,336.58 with the default levers (schedule non-prod, spot batch).
    const aks = cardFor('AKS');
    expect(headerAnnual(aks)).toBe('$54,336.58');
  });

  it('lands the cheapest badge on App Service and the recommended badge on AKS', async () => {
    await renderHostingWorkspace();

    const appsvc = cardFor('App Service');
    const aks = cardFor('AKS');

    expect(within(appsvc).getByText('Cheapest')).toBeInTheDocument();
    expect(within(aks).getByText('Recommended')).toBeInTheDocument();

    // The badges are exclusive — cheapest is not recommended and vice versa.
    expect(within(appsvc).queryByText('Recommended')).toBeNull();
    expect(within(aks).queryByText('Cheapest')).toBeNull();
  });

  it('reprices when a lever is toggled', async () => {
    const user = userEvent.setup();
    await renderHostingWorkspace();

    // AKS is expanded by default (first option), so its lever rail is visible.
    const aks = cardFor('AKS');
    expect(headerAnnual(aks)).toBe('$54,336.58');

    const reserve = within(aks).getByRole('switch', { name: 'Reserve steady prod' });
    expect(reserve).toHaveAttribute('aria-checked', 'false');

    await user.click(reserve);

    expect(reserve).toHaveAttribute('aria-checked', 'true');
    // Reserving steady prod compute (3yr RI, 0.5×) drops the annual run-rate.
    expect(headerAnnual(aks)).toBe('$36,096.58');
    expect(headerAnnual(aks)).not.toBe('$54,336.58');
  });

  it('persists a lever toggle through the repository port', async () => {
    const user = userEvent.setup();
    const repository = createHostingRepository();
    render(
      <DecisionStudioProvider host={createTestHost(repository)}>
        <DecisionWorkspace decisionRef={HOSTING_DECISION_REF} />
      </DecisionStudioProvider>,
    );
    await screen.findByText('AKS');

    const aks = cardFor('AKS');
    await user.click(within(aks).getByRole('switch', { name: 'Reserve steady prod' }));

    // The write went through the port: reading it back shows the flipped lever.
    const stored = await repository.readDecision(HOSTING_DECISION_REF);
    const lever = stored.spec.options
      .find((o) => o.id === 'aks')
      ?.levers?.find((l) => l.id === 'reserveProd');
    expect(lever?.enabled).toBe(true);
  });
});

describe('DecisionWorkspace — incomplete options + links', () => {
  it('renders an incomplete option as "Modelling" with em-dash costs', async () => {
    await renderHostingWorkspace();
    const aca = cardFor('Azure Container Apps');
    expect(within(aca).getByText('Modelling')).toBeInTheDocument();
    expect(headerAnnual(aca)).toBe('—');
  });

  it('renders unresolved links as inert labels — spans, not anchors or buttons', async () => {
    await renderHostingWorkspace();

    const linksBlock = screen.getByText('Traces to').closest('.ds-links') as HTMLElement;
    expect(linksBlock).not.toBeNull();

    // No resolvable link → no anchors, no buttons in the links row.
    expect(within(linksBlock).queryByRole('link')).toBeNull();
    expect(within(linksBlock).queryByRole('button')).toBeNull();

    const label = within(linksBlock).getByText('deploy/hosting-platform');
    expect(label.closest('.ds-lk')?.tagName).toBe('SPAN');
    expect(label.closest('.ds-lk')).toHaveAttribute('aria-disabled', 'true');
  });
});
