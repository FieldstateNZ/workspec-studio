import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CostStudioProvider } from './context.js';
import { createTestRepository, TEST_INVENTORY_AS_OF } from './test-helpers/cost-estate.js';
import { TagPlanView } from './tag-plan-view.js';

describe('TagPlanView', () => {
  it('renders the header id, baseline line, and summary counts', async () => {
    const { repository, inventoryRef, tagPlanRef } = createTestRepository();
    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <TagPlanView inventoryRef={inventoryRef} tagPlanRef={tagPlanRef} />
      </CostStudioProvider>,
    );

    expect(await screen.findByText('2026-01.tagplan.yaml')).toBeInTheDocument();
    expect(screen.getByText(`baseline: inventory asOf ${TEST_INVENTORY_AS_OF}`)).toBeInTheDocument();
    expect(screen.getByText('+1 add')).toBeInTheDocument();
    expect(screen.getByText('~1 change')).toBeInTheDocument();
    expect(screen.getByText('−1 remove')).toBeInTheDocument();
    expect(screen.getByText('1 noop')).toBeInTheDocument();
  });

  it('sorts rows remove → change → add and hides noops', async () => {
    const { repository, inventoryRef, tagPlanRef } = createTestRepository();
    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <TagPlanView inventoryRef={inventoryRef} tagPlanRef={tagPlanRef} />
      </CostStudioProvider>,
    );
    await screen.findByText('2026-01.tagplan.yaml');

    const opBadges = screen.getAllByText(/^(add|change|remove)$/);
    expect(opBadges.map((el) => el.textContent)).toEqual(['remove', 'change', 'add']);
    expect(screen.queryByText('acme')).not.toBeInTheDocument(); // the noop row's current/desired value
  });

  it('shows the drift pill when the inventory asOf disagrees with the plan baseline', async () => {
    const drifted = createTestRepository({ tagPlanBaselineAsOf: '2020-01-01T00:00:00Z' });
    render(
      <CostStudioProvider host={{ repository: drifted.repository, capabilities: { editAttribution: true } }}>
        <TagPlanView inventoryRef={drifted.inventoryRef} tagPlanRef={drifted.tagPlanRef} />
      </CostStudioProvider>,
    );
    expect(await screen.findByText('baseline drifted — stocktake before apply')).toBeInTheDocument();
  });

  it('hides the drift pill when the inventory asOf matches the plan baseline', async () => {
    const stable = createTestRepository();
    render(
      <CostStudioProvider host={{ repository: stable.repository, capabilities: { editAttribution: true } }}>
        <TagPlanView inventoryRef={stable.inventoryRef} tagPlanRef={stable.tagPlanRef} />
      </CostStudioProvider>,
    );
    await screen.findByText('2026-01.tagplan.yaml');
    expect(screen.queryByText('baseline drifted — stocktake before apply')).not.toBeInTheDocument();
  });

  it('names the CLI in the empty state when no tag plan is selected', () => {
    const { repository, inventoryRef } = createTestRepository();
    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <TagPlanView inventoryRef={inventoryRef} />
      </CostStudioProvider>,
    );
    expect(screen.getByText('$ workspec-cost plan')).toBeInTheDocument();
  });
});
