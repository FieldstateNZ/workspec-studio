import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { C4Demo } from './c4-demo.js';
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
  Object.defineProperty(document, 'modelContext', { configurable: true, value: context });
  return registered;
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
});

describe('Architecture Studio WebMCP integration', () => {
  it('registers five tools and atomically replaces the visible model', async () => {
    const registered = installModelContext();
    render(
      <StrictMode>
        <C4Demo />
      </StrictMode>,
    );

    await waitFor(() => expect(registered.size).toBe(5), { timeout: 5_000 });
    expect(screen.getByText('Agent tools ready')).toBeInTheDocument();
    expect(screen.getByText('Stormglass')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.c4-diagram')).toHaveAttribute('data-layout-editable', 'true'),
    );
    const sidebar = screen.getByRole('complementary', { name: 'Studio navigation' });
    expect(sidebar).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cost Attribution' })).toHaveAttribute('href', '/cost');
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(sidebar).toContainElement(collapse);
    expect(sidebar).toContainElement(screen.getByRole('group', { name: 'Theme' }));
    expect(screen.getByRole('banner')).not.toContainElement(collapse);
    fireEvent.click(collapse);
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(sidebar).toContainElement(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar.querySelector('.theme-toggle-collapsed')).toBeInTheDocument();

    let result: Record<string, unknown> | undefined;
    await act(async () => {
      result = await registered.get('load_architecture_snapshot')?.execute({
        system: {
          name: 'Delivery Platform',
          description: 'Routes customer orders to the fulfilment service.',
        },
        elements: [
          {
            id: 'customer',
            kind: 'actor',
            name: 'Customer',
            description: 'Places an order.',
          },
          {
            id: 'orders-api',
            kind: 'container',
            name: 'Orders API',
            description: 'Accepts and validates orders.',
            technology: 'Node.js',
          },
        ],
        relationships: [
          {
            from: 'customer',
            to: 'orders-api',
            description: 'Places an order',
            category: 'interaction',
          },
        ],
      });
    });

    expect(result?.ok).toBe(true);
    expect(screen.getByText('Delivery Platform')).toBeInTheDocument();
    expect(screen.getByText('Architecture stocktake loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download .workspec bundle' })).toBeEnabled();
  }, 15_000);
});
