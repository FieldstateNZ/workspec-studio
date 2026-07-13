import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CostRepositoryPort } from '@workspec/cost-schema';
import { AttributionWorkbench } from './attribution-workbench.js';
import { CostStudioProvider } from './context.js';
import { createTestRepository } from './test-helpers/cost-estate.js';

function renderWorkbench(editAttribution = true): {
  repository: CostRepositoryPort;
  inventoryRef: string;
  attributionRef: string;
} {
  const { repository, inventoryRef, attributionRef } = createTestRepository();
  render(
    <CostStudioProvider host={{ repository, capabilities: { editAttribution } }}>
      <AttributionWorkbench inventoryRef={inventoryRef} attributionRef={attributionRef} />
    </CostStudioProvider>,
  );
  return { repository, inventoryRef, attributionRef };
}

describe('AttributionWorkbench', () => {
  it('renders the baseline coverage figure computed from the test estate (55.3%)', async () => {
    renderWorkbench();
    expect(await screen.findByText('55.3%')).toBeInTheDocument();
    expect(screen.getByText('$380/mo unattributed')).toBeInTheDocument();
  });

  it('toggling a rule off recomputes coverage live and never writes', async () => {
    const { repository } = renderWorkbench();
    const writeSpy = vi.spyOn(repository, 'writeAttribution');
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByLabelText('Toggle rule r1'));

    expect(await screen.findByText('37.6%')).toBeInTheDocument();
    expect(writeSpy).not.toHaveBeenCalled();

    // Toggling back on restores the original figure.
    fireEvent.click(screen.getByLabelText('Toggle rule r1'));
    expect(await screen.findByText('55.3%')).toBeInTheDocument();
  });

  it('reordering a rule persists the new order via writeAttribution', async () => {
    const { repository, attributionRef } = renderWorkbench(true);
    const writeSpy = vi.spyOn(repository, 'writeAttribution');
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByLabelText('Move rule r1 down'));

    await waitFor(() => expect(writeSpy).toHaveBeenCalledTimes(1));
    const [ref, attribution] = writeSpy.mock.calls[0] as [string, { spec: { rules: { id: string }[] } }];
    expect(ref).toBe(attributionRef);
    expect(attribution.spec.rules.map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'r4']);
  });

  it('hides reorder controls when the host does not grant editAttribution', async () => {
    renderWorkbench(false);
    await screen.findByText('55.3%');
    expect(screen.queryByLabelText('Move rule r1 down')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move rule r1 up')).not.toBeInTheDocument();
  });

  it('opens the inline cascade for a resource, matching the engine trace strings', async () => {
    renderWorkbench();
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByText('res-client1'));

    expect(await screen.findByText('resolution · first match wins')).toBeInTheDocument();
    expect(screen.getByText('→ client = acme')).toBeInTheDocument();
    expect(screen.getByText('→ costType = opex')).toBeInTheDocument();
    expect(screen.getByText('2 rules did not match')).toBeInTheDocument();
  });

  it('renders the pinned-override trace line for the overridden resource', async () => {
    renderWorkbench();
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByText('res-override'));

    expect(await screen.findByText('→ product = shared (beats all rules)')).toBeInTheDocument();
  });

  it('triage: Fix coverage renders unattributed clusters, and the composer shows a live projection', async () => {
    renderWorkbench();
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByText('Fix coverage →'));

    const rgCluster = await screen.findByText('rg-c · 2 · $280');
    expect(screen.getByText('rg-legacy · 2 · $100')).toBeInTheDocument();

    fireEvent.click(rgCluster);

    expect(await screen.findByText('resourceGroup ~ rg-c')).toBeInTheDocument();
    expect(screen.getByText(/matches 2 · \$280\/mo/)).toBeInTheDocument();
    expect(screen.getByText('88.2%')).toBeInTheDocument();
  });

  it('Add as r5 appends and persists the promoted rule, and the rail gains a ✕ row', async () => {
    const { repository, attributionRef } = renderWorkbench();
    const writeSpy = vi.spyOn(repository, 'writeAttribution');
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByText('Fix coverage →'));
    fireEvent.click(await screen.findByText('rg-c · 2 · $280'));
    fireEvent.click(await screen.findByText('Add as r5'));

    await waitFor(() => expect(writeSpy).toHaveBeenCalledTimes(1));
    const [ref, attribution] = writeSpy.mock.calls[0] as [
      string,
      { spec: { rules: { id: string; match: { resourceGroup?: string }; assign?: Record<string, string> }[] } },
    ];
    expect(ref).toBe(attributionRef);
    const added = attribution.spec.rules.at(-1);
    expect(added).toEqual({ id: 'r5', name: 'promoted-rg-c', match: { resourceGroup: 'rg-c' }, assign: { product: 'shared' } });

    const r5Row = await screen.findByText('r5');
    const row = r5Row.closest('.cost-rule-row');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByLabelText('Remove rule r5')).toBeInTheDocument();
  });

  it('composer over a mixed cluster counts only the currently-unattributed resources, not the whole resource group', async () => {
    renderWorkbench();
    await screen.findByText('55.3%');

    fireEvent.click(screen.getByText('Fix coverage →'));
    // rg-legacy has 3 resources (res-legacy1, res-legacy2, res-override), but
    // res-override is already pinned to product=shared, so the cluster chip
    // itself only counts the 2 still-unattributed ones — matches this test's
    // very premise for the composer below.
    const rgLegacyCluster = await screen.findByText('rg-legacy · 2 · $100');
    fireEvent.click(rgLegacyCluster);

    expect(await screen.findByText('resourceGroup ~ rg-legacy')).toBeInTheDocument();
    // The appended rule can never win res-override (a pinned override beats
    // all rules), so the projection must count only the 2 resources it can
    // actually attribute — $100, not all 3 members' $120.
    expect(screen.getByText(/matches 2 · \$100\/mo/)).toBeInTheDocument();
    expect(screen.queryByText(/matches 3 ·/)).not.toBeInTheDocument();
  });

  it('pressing Enter on a focused resource row opens its cascade (keyboard access to the primary interaction)', async () => {
    renderWorkbench();
    await screen.findByText('55.3%');

    const row = screen.getByText('res-client1').closest('.cost-table-row') as HTMLElement;
    expect(row).not.toBeNull();
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(await screen.findByText('resolution · first match wins')).toBeInTheDocument();
    expect(screen.getByText('→ client = acme')).toBeInTheDocument();
  });
});
