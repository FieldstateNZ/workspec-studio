import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CostInventory } from './cost-inventory.js';
import { CostStudioProvider } from './context.js';
import { createTestRepository } from './test-helpers/cost-estate.js';

function renderInventory(): void {
  const { repository, inventoryRef, attributionRef } = createTestRepository();
  render(
    <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
      <CostInventory inventoryRef={inventoryRef} attributionRef={attributionRef} />
    </CostStudioProvider>,
  );
}

describe('CostInventory', () => {
  it('renders the asOf/count strip and the CLI drift caption instead of fabricated drift rows', async () => {
    renderInventory();
    expect(await screen.findByText(/asOf 2026-01-01T00:00:00Z · 8 resources · 4 resource groups/)).toBeInTheDocument();
    expect(screen.getByText('run workspec-cost stocktake to check for drift')).toBeInTheDocument();
  });

  it('flags unattributed rows with the danger inset class and counts them in the filter chip', async () => {
    renderInventory();
    await screen.findByText('res-a1');
    expect(screen.getByText('Unattributed · 4')).toBeInTheDocument();

    const clientRow = screen.getByText('res-client1').closest('.cost-inventory-row');
    expect(clientRow).toHaveClass('cost-inventory-row--unattributed');
    const attributedRow = screen.getByText('res-a1').closest('.cost-inventory-row');
    expect(attributedRow).not.toHaveClass('cost-inventory-row--unattributed');
  });

  it('renders the Has tags filter chip and existing tags column', async () => {
    renderInventory();
    await screen.findByText('res-a1');
    expect(screen.getByText('Has tags · 2')).toBeInTheDocument();
    expect(screen.getAllByText('client=acme')).toHaveLength(2); // res-client1 and res-client2

    fireEvent.click(screen.getByText('Has tags · 2'));
    expect(screen.getByText('res-client1')).toBeInTheDocument();
    expect(screen.queryByText('res-a1')).not.toBeInTheDocument();
  });

  it('renders top type-count chips', async () => {
    renderInventory();
    await screen.findByText('res-a1');
    // App Service ×2, Storage ×2, VM ×3, AKS cluster ×1 — VM should sort first by count.
    expect(screen.getByText('VM ×3')).toBeInTheDocument();
  });
});
