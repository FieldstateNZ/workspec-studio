import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compute, recommend } from '@workspec/decision-engine';
import { DecisionCard } from './card.js';
import {
  HOSTING_DECISION_REF,
  createHostingRepository,
  createTestHost,
  loadHostingCatalog,
  loadHostingDecision,
  renderWithHost,
} from './test-utils.js';

describe('DecisionCard — compact read-only summary', () => {
  it('shows the recommended option and its annual cost while exploring', async () => {
    // Sanity-check the golden math the card must reproduce: hosting-platform is `exploring`,
    // so the card features the engine's recommendation (AKS) at its annual cost.
    const decision = loadHostingDecision();
    const catalog = loadHostingCatalog();
    const result = compute(decision, catalog);
    const recommendedId = recommend(result, decision);
    expect(recommendedId).toBe('aks');
    expect(result.byOption.aks?.annual).toBe(54336.576);

    renderWithHost(<DecisionCard decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(createHostingRepository()),
    });

    // Title + status + the recommended option name.
    expect(
      await screen.findByText('Hosting platform for the data and delivery services', {
        selector: '.ds-card-title',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Exploring', { selector: '.ds-status' })).toBeInTheDocument();
    expect(
      screen.getByText('Recommended', { selector: '.ds-card-choice-lab' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AKS', { selector: '.ds-card-choice-nm' })).toBeInTheDocument();

    // The headline cost is the engine's AKS annual, full + stable ($54,336.58).
    expect(screen.getByText('$54,336.58', { selector: '.ds-card-cost-v' })).toBeInTheDocument();
  });

  it('features the chosen option once the decision is decided', async () => {
    const decision = loadHostingDecision();
    // Record an outcome choosing App Service (annual $16,104).
    const decided = {
      ...decision,
      metadata: { ...decision.metadata, status: 'decided' as const },
      spec: {
        ...decision.spec,
        outcome: {
          option: 'appsvc',
          rationale: 'We accept a lower scale ceiling for zero migration and minimal ops.',
        },
      },
    };
    const repository = createHostingRepository();
    await repository.writeDecision(HOSTING_DECISION_REF, decided);

    renderWithHost(<DecisionCard decisionRef={HOSTING_DECISION_REF} />, {
      host: createTestHost(repository),
    });

    expect(await screen.findByText('Decided', { selector: '.ds-status' })).toBeInTheDocument();
    expect(screen.getByText('Chosen', { selector: '.ds-card-choice-lab' })).toBeInTheDocument();
    expect(screen.getByText('App Service', { selector: '.ds-card-choice-nm' })).toBeInTheDocument();
    expect(screen.getByText('$16,104', { selector: '.ds-card-cost-v' })).toBeInTheDocument();
  });
});
