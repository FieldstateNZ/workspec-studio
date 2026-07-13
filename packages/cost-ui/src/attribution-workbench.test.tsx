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
});
