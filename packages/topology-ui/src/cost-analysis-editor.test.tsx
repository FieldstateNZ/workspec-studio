import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveInfrastructurePlan, seedCostAnalysis } from '@workspec/topology-planning';
import { CostAnalysisEditor } from './cost-analysis-editor.js';

const plan = deriveInfrastructurePlan('Ledger', [{ id: 'web', kind: 'container', name: 'Web' }]);
const callbacks = () => ({ onRenameOption: vi.fn(), onDuplicateOption: vi.fn(), onSkuChange: vi.fn(), onLineChange: vi.fn(), onCreateOption: vi.fn(), onCatalogChange: vi.fn() });

describe('Cost Analysis hierarchy', () => {
  it('opens populated workspaces on solution options', () => {
    const analysis = seedCostAnalysis(plan);
    render(<CostAnalysisEditor analysis={analysis} plan={plan} computed={[]} {...callbacks()} />);
    expect(screen.getByRole('tab', { name: /Solution options/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Solution options are the main workspace.')).toBeInTheDocument();
    expect(screen.queryByText('A provider is anywhere you can buy capacity.')).not.toBeInTheDocument();
  });

  it('shows a catalog-empty state with a manage action', () => {
    const seeded = seedCostAnalysis(plan);
    const analysis = { ...seeded, options: [], catalog: { ...seeded.catalog, providers: [], resources: [], skus: [] } };
    const actions = callbacks();
    render(<CostAnalysisEditor analysis={analysis} plan={plan} computed={[]} {...actions} />);
    expect(screen.getByRole('heading', { name: 'Populate the cost catalog' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage catalog →' }));
    expect(screen.getByRole('tab', { name: 'Manage catalog' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a distinct option-empty state and creates the first option', () => {
    const seeded = seedCostAnalysis(plan);
    const analysis = { ...seeded, options: [] };
    const actions = callbacks();
    render(<CostAnalysisEditor analysis={analysis} plan={plan} computed={[]} {...actions} />);
    expect(screen.getByRole('heading', { name: 'Create your first solution option' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create solution option →' }));
    expect(actions.onCreateOption).toHaveBeenCalledOnce();
  });
});
