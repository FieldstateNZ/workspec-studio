import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CostDemo } from './cost-demo.js';
import type { WebMcpModelContext, WebMcpToolDefinition } from './cost-webmcp.js';

function installModelContext(): Map<string, WebMcpToolDefinition> {
  const registered = new Map<string, WebMcpToolDefinition>();
  const context: WebMcpModelContext = {
    async registerTool(tool, options) {
      if (registered.has(tool.name)) throw new Error(`duplicate ${tool.name}`);
      registered.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => registered.delete(tool.name), {
        once: true,
      });
    },
  };
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: context,
  });
  return registered;
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
});

describe('CostDemo WebMCP integration', () => {
  it('previews without mutation, applies into the visible cache, and resets cleanly', async () => {
    const registered = installModelContext();
    const user = userEvent.setup();
    render(
      <StrictMode>
        <CostDemo />
      </StrictMode>,
    );

    expect(await screen.findByText('81.2%')).toBeInTheDocument();
    await waitFor(() => expect(registered.size).toBe(6));
    expect(screen.getByText('Agent tools ready')).toBeInTheDocument();

    const previewTool = registered.get('preview_attribution_rule');
    const applyTool = registered.get('apply_attribution_rule');
    expect(previewTool).toBeDefined();
    expect(applyTool).toBeDefined();

    let proposalId: unknown;
    await act(async () => {
      const preview = await previewTool?.execute({
        resourceGroup: 'rg-legacy-misc',
        value: 'shared',
      });
      proposalId = preview?.proposalId;
    });
    expect(typeof proposalId).toBe('string');
    expect(screen.getByText('Agent preview - no changes yet')).toBeInTheDocument();
    expect(screen.getByText(/81\.2% to 90\.0%/)).toBeInTheDocument();
    expect(screen.getByText('81.2%')).toBeInTheDocument();

    await act(async () => {
      await applyTool?.execute({ proposalId });
    });
    expect(await screen.findByText('90.0%')).toBeInTheDocument();
    expect(screen.getByText('Agent applied r9')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset sample' }));
    expect(await screen.findByText('81.2%')).toBeInTheDocument();
    await waitFor(() => expect(registered.size).toBe(6));
    expect(screen.getByText('Agent tools ready')).toBeInTheDocument();
  }, 15_000);

  it('replaces the sample, enters setup, then opens the workbench after attribution creation', async () => {
    const registered = installModelContext();
    render(<CostDemo />);
    await waitFor(() => expect(registered.size).toBe(6));
    const loadTool = registered.get('load_cost_snapshot');

    await act(async () => {
      await loadTool?.execute({
        estateName: 'Demo subscription',
        provider: 'azure',
        asOf: '2026-09-02T00:00:00Z',
        period: '2026-09',
        currency: 'NZD',
        resources: [
          {
            id: '/subscriptions/demo/resourceGroups/rg-app/providers/Microsoft.Web/sites/app',
            name: 'app',
            type: 'Microsoft.Web/sites',
            location: 'australiaeast',
            resourceGroup: 'rg-app',
            account: 'demo',
            monthlySpend: 42,
            serviceCategory: 'App Service',
          },
        ],
      });
    });

    expect(screen.getByRole('heading', { name: 'Demo subscription' })).toBeInTheDocument();
    expect(screen.getByText(/no cloud credentials are used/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download .workspec bundle' })).toBeDisabled();
    await waitFor(() =>
      expect([...registered.keys()].sort()).toEqual([
        'create_cost_attribution',
        'inspect_cost_setup',
        'load_cost_snapshot',
      ]),
    );

    await act(async () => {
      await registered.get('create_cost_attribution')?.execute({
        name: 'Product ownership',
        dimensionId: 'product',
        dimensionLabel: 'Product',
        values: ['app'],
      });
    });

    await waitFor(() => expect(registered.size).toBe(6));
    expect(screen.queryByRole('heading', { name: 'Demo subscription' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download .workspec bundle' })).toBeEnabled();
    expect(registered.has('list_unattributed_clusters')).toBe(true);
  }, 15_000);
});
