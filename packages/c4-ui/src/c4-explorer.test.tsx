import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { C4Explorer } from './c4-explorer.js';
import { loadSyntheticModel } from './test-helpers/synthetic-model.js';

describe('C4Explorer — tree nav + per-diagram layout', () => {
  it('lists every diagram in the model and selects the first one (in C4Model.diagrams order) by default', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} />);

    expect(screen.getByRole('navigation', { name: 'Diagrams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System Context/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Containers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Billing components/i })).toBeInTheDocument();

    const firstSlug = model.diagrams[0]?.slug;
    expect(firstSlug).toBe('billing'); // lexicographic file order: billing.yaml < context.yaml < ledger.yaml
    expect(screen.getByRole('button', { name: /Billing components/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(await screen.findByText('Invoicing')).toBeInTheDocument();
  });

  it('honours initialDiagramSlug', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);
    expect(screen.getByRole('button', { name: /Containers/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(await screen.findByText('Billing')).toBeInTheDocument();
  });

  it('clicking a tree item switches the rendered diagram', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /Containers/i }));
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Architect')).not.toBeInTheDocument();
  });

  it('drills down across all three levels: context -> container -> component', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    // context -> container: click the injected system node (resolved slug "ledger").
    fireEvent.click(screen.getByRole('button', { name: /system: Ledger/i }));
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Containers/i })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // container -> component: click the "billing" domain node (resolved slug "billing").
    fireEvent.click(screen.getByRole('button', { name: /domain: Billing/i }));
    expect(await screen.findByText('Invoicing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Billing components/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('clicking a node whose slug matches no diagram is a no-op (stays on the same diagram)', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');

    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    expect(screen.getByRole('button', { name: /System Context/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByText('Architect')).toBeInTheDocument();
  });
});

describe('C4Explorer — lens toggle for a c4-container diagram', () => {
  it('shows no lens toggle for a non-lens-partitioned diagram (context)', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="context" />);
    await screen.findByText('Architect');
    expect(screen.queryByText('Logical')).not.toBeInTheDocument();
    expect(screen.queryByText('Deployment')).not.toBeInTheDocument();
  });

  it('defaults a c4-container diagram to the logical lens: its edges render, the deployment-only edge does not', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);
    await screen.findByText('Billing');

    expect(screen.getByText('Logical')).toBeInTheDocument();
    expect(screen.getByText('publishes events')).toBeInTheDocument(); // lens: logical
    expect(screen.getByText('publishes/consumes')).toBeInTheDocument(); // lens: both
    expect(screen.queryByText('reads/writes')).not.toBeInTheDocument(); // lens: deployment
  });

  it('switching to the deployment lens re-lays-out with the deployment-lens edges', async () => {
    const model = await loadSyntheticModel();
    render(<C4Explorer model={model} initialDiagramSlug="ledger" />);
    await screen.findByText('Billing');

    fireEvent.click(screen.getByText('Deployment'));

    expect(await screen.findByText('reads/writes')).toBeInTheDocument(); // lens: deployment
    expect(screen.getByText('publishes/consumes')).toBeInTheDocument(); // lens: both
    expect(screen.queryByText('publishes events')).not.toBeInTheDocument(); // lens: logical
  });
});
