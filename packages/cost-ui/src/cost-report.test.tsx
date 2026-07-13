import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CostReport } from './cost-report.js';
import { CostStudioProvider } from './context.js';
import { createTestRepository } from './test-helpers/cost-estate.js';

function renderReport(props: { disabledRuleIds?: string[]; onFixCoverage?: () => void } = {}): void {
  const { repository, inventoryRef, attributionRef } = createTestRepository();
  render(
    <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
      <CostReport
        inventoryRef={inventoryRef}
        attributionRef={attributionRef}
        {...(props.disabledRuleIds !== undefined ? { disabledRuleIds: props.disabledRuleIds } : {})}
        {...(props.onFixCoverage !== undefined ? { onFixCoverage: props.onFixCoverage } : {})}
      />
    </CostStudioProvider>,
  );
}

function statCard(eyebrow: string): HTMLElement {
  const card = screen.getByText(eyebrow).closest('.cost-stat-card');
  if (card === null) throw new Error(`no .cost-stat-card ancestor for "${eyebrow}"`);
  return card as HTMLElement;
}

describe('CostReport', () => {
  it('renders the total-spend and unattributed stat cards from the test estate', async () => {
    renderReport();
    await screen.findByText('Rollups');
    expect(within(statCard('Total spend')).getByText('$850')).toBeInTheDocument();
    expect(within(statCard('Total spend')).getByText('8 resources · 4 resource groups')).toBeInTheDocument();
    expect(within(statCard('Unattributed')).getByText('$380')).toBeInTheDocument();
    expect(within(statCard('Unattributed')).getByText('4 resources')).toBeInTheDocument();
  });

  it('renders the product × costType cross-tab cells computed from attribute()', async () => {
    renderReport();
    await screen.findByText('Rollups');
    expect(screen.getByText('Product × Cost type')).toBeInTheDocument();
    // workspec row: res-a1 $100 + res-a2 $50 + the aks split's 60% share of $300 = $330 opex, $330 total.
    const workspecRow = screen
      .getByText('workspec', { selector: '.cost-crosstab-cell' })
      .closest('.cost-crosstab-row') as HTMLElement;
    expect(workspecRow).not.toBeNull();
    const cells = workspecRow.querySelectorAll('.cost-crosstab-cell--right');
    expect(cells[0]).toHaveTextContent('$0'); // capex
    expect(cells[1]).toHaveTextContent('$330'); // opex
    expect(cells[2]).toHaveTextContent('$330'); // total
  });

  it('is "live against the rule set": a disabled rule changes the rollup', async () => {
    renderReport({ disabledRuleIds: ['r1'] });
    await screen.findByText('Rollups');
    // With r1 disabled, res-a1/res-a2 lose their product assignment; only the
    // AKS split's 60% share ($180) remains attributed to workspec.
    const workspecSpendRow = screen.getByText('workspec', { selector: '.cost-chip' }).closest('.cost-spend-row');
    expect(workspecSpendRow).not.toBeNull();
    expect(within(workspecSpendRow as HTMLElement).getByText('$180')).toBeInTheDocument();
  });

  it('sorts spend-by-dimension rows by amount descending, with `unattributed` pinned last', async () => {
    renderReport();
    await screen.findByText('Rollups');
    // Amounts (test estate): workspec $330, atrium $120, shared $20,
    // unattributed $380 — unattributed is the LARGEST bucket, but must
    // still render last, not first.
    const rows = document.querySelectorAll('.cost-spend-row');
    const keys = [...rows].map((row) => row.querySelector('.cost-chip')?.textContent);
    expect(keys).toEqual(['workspec', 'atrium', 'shared', 'unattributed']);
  });

  it('calls onFixCoverage when "Fix in workbench →" is clicked', async () => {
    const onFixCoverage = vi.fn();
    renderReport({ onFixCoverage });
    await screen.findByText('Rollups');
    fireEvent.click(screen.getByText('Fix in workbench →'));
    expect(onFixCoverage).toHaveBeenCalledTimes(1);
  });
});
