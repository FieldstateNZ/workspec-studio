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
    await waitFor(() => expect(registered.size).toBe(5));
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

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(await screen.findByText('81.2%')).toBeInTheDocument();
    await waitFor(() => expect(registered.size).toBe(5));
    expect(screen.getByText('Agent tools ready')).toBeInTheDocument();
  }, 15_000);
});
