import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionApp } from './app.js';
import { DecisionCatalog } from './catalog.js';
import {
  HOSTING_CATALOG_REF,
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  renderWithHost,
} from './test-utils.js';

const EDIT_HOST = { capabilities: { editCatalog: true, decide: true } };
const READONLY_HOST = { capabilities: { editCatalog: false, decide: false } };

describe('DecisionCatalog — capability gating (P3 simple model)', () => {
  it('renders read-only when editCatalog is off — no inputs, no add/delete', async () => {
    const repository = createHostingRepository();
    renderWithHost(<DecisionCatalog catalogRef={HOSTING_CATALOG_REF} />, {
      host: createTestHost(repository, READONLY_HOST),
    });
    await screen.findByText('D8s v5');

    // Values render as text, not editable controls.
    expect(screen.queryByLabelText('D8s v5 price')).toBeNull();
    expect(screen.getByText('$380')).toBeInTheDocument();
    // No editing affordances.
    expect(screen.queryByRole('button', { name: 'Add SKU' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
  });

  it('exposes editable controls when editCatalog is on', async () => {
    const repository = createHostingRepository();
    renderWithHost(<DecisionCatalog catalogRef={HOSTING_CATALOG_REF} />, {
      host: createTestHost(repository, EDIT_HOST),
    });
    await screen.findByLabelText('D8s v5 price');
    expect(screen.getByLabelText('D8s v5 price')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('button', { name: 'Add SKU' })).toBeInTheDocument();
  });

  it('persists a SKU price edit through the port', async () => {
    const user = userEvent.setup();
    const repository = createHostingRepository();
    renderWithHost(<DecisionCatalog catalogRef={HOSTING_CATALOG_REF} />, {
      host: createTestHost(repository, EDIT_HOST),
    });
    const price = await screen.findByLabelText('D8s v5 price');
    await user.clear(price);
    await user.type(price, '760');

    const stored = await repository.readCatalog(HOSTING_CATALOG_REF);
    expect(stored.spec.skus.find((s) => s.id === 'd8s_v5')?.price).toBe(760);
  });

  it('edits pricing modes and schedules', async () => {
    const user = userEvent.setup();
    const repository = createHostingRepository();
    renderWithHost(<DecisionCatalog catalogRef={HOSTING_CATALOG_REF} />, {
      host: createTestHost(repository, EDIT_HOST),
    });
    await screen.findByLabelText('D8s v5 price');

    // Pricing modes tab: toggle a committed flag + change a multiplier.
    await user.click(screen.getByRole('tab', { name: /Pricing modes/ }));
    const spotMult = await screen.findByLabelText('Spot multiplier');
    await user.clear(spotMult);
    await user.type(spotMult, '0.2');

    // Schedules tab: change an uptime percent (business 30% → 40%).
    await user.click(screen.getByRole('tab', { name: /Schedules/ }));
    const businessPct = await screen.findByLabelText('Business hrs uptime percent');
    await user.clear(businessPct);
    await user.type(businessPct, '40');

    const stored = await repository.readCatalog(HOSTING_CATALOG_REF);
    expect(stored.spec.pricingModes.find((m) => m.id === 'spot')?.mult).toBe(0.2);
    expect(stored.spec.schedules.find((s) => s.id === 'business')?.pct).toBeCloseTo(0.4, 5);
  });
});

// The headline requirement: a catalog edit reprices EVERY option that
// references it. Driven end-to-end through DecisionApp so the Catalog and
// Workspace views share one query cache.
describe('DecisionCatalog — edits recompute costs across options', () => {
  it('changing a SKU price changes an option cost in the Options view', async () => {
    const user = userEvent.setup();
    const repository = createHostingRepository();
    renderWithHost(<DecisionApp decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(repository, EDIT_HOST),
    });

    // Options view first — capture AKS's baseline annual.
    await screen.findByText('AKS', { selector: '.ds-opt-title' });
    const aksCard = screen.getByText('AKS', { selector: '.ds-opt-title' }).closest('.ds-opt');
    const annualBefore = (aksCard as HTMLElement).querySelector(
      '.ds-opt-annual .ds-v',
    )?.textContent;
    expect(annualBefore).toBe('$54,336.58');

    // Catalog view — double the D8s v5 price (the AKS workload pool SKU).
    await user.click(screen.getByRole('tab', { name: /^Catalog/ }));
    const price = await screen.findByLabelText('D8s v5 price');
    await user.clear(price);
    await user.type(price, '760');

    // Back to Options — AKS has repriced.
    await user.click(screen.getByRole('tab', { name: /^Options/ }));
    const aksAfter = await screen.findByText('AKS', { selector: '.ds-opt-title' });
    const annualAfter = aksAfter
      .closest('.ds-opt')
      ?.querySelector('.ds-opt-annual .ds-v')?.textContent;
    expect(annualAfter).not.toBe('$54,336.58');
    // Workload pool = D8s v5 × (dev 1 + test 1 + prod 4) = 6 units; +$380/unit/mo
    // ⇒ +$2,280/mo ⇒ +$27,360/yr over the $54,336.58 baseline.
    expect(annualAfter).toBe('$81,696.58');
  });
});
