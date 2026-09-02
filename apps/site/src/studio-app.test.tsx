import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioApp } from './studio-app.js';
import type { WebMcpModelContext, WebMcpToolDefinition } from './cost-webmcp.js';

function installModelContext(): Map<string, WebMcpToolDefinition> {
  const tools = new Map<string, WebMcpToolDefinition>();
  const context: WebMcpModelContext = {
    async registerTool(tool, options) {
      tools.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true });
    },
  };
  Object.defineProperty(document, 'modelContext', { configurable: true, value: context });
  return tools;
}

function tool(tools: Map<string, WebMcpToolDefinition>, name: string): WebMcpToolDefinition {
  const value = tools.get(name);
  if (value === undefined) throw new Error(`Tool not registered: ${name}`);
  return value;
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  window.history.pushState({}, '', '/');
});

describe('connected Studio workflow', () => {
  it('exposes WebMCP tools over the same plan and records a visible decision', async () => {
    window.history.pushState({}, '', '/studio/design');
    const tools = installModelContext();
    render(<StudioApp />);

    await waitFor(() => expect(tools.size).toBe(6));
    await waitFor(() => expect(screen.getByText('Fieldstate Ledger')).toBeInTheDocument());
    const summary = await tool(tools, 'get_workspec_workspace_summary').execute({});
    expect(summary).toMatchObject({ project: 'Fieldstate Ledger', requirements: 4 });

    const before = await tool(tools, 'compare_cloud_providers').execute({});
    await act(async () => {
      await tool(tools, 'update_infrastructure_requirements').execute({ changes: [{ id: 'web-app', size: 'large', quantity: 2 }] });
    });
    const after = await tool(tools, 'compare_cloud_providers').execute({});
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));

    await expect(tool(tools, 'update_infrastructure_requirements').execute({ changes: [{ id: 'missing', size: 'large' }] })).rejects.toThrow('Unknown requirement');
    expect((await tool(tools, 'get_workspec_workspace_summary').execute({})).requirements).toBe(4);

    await act(async () => {
      await tool(tools, 'record_cloud_decision').execute({ provider: 'azure', rationale: 'Best operational fit.' });
    });
    expect(await screen.findByText('Decision recorded.')).toBeInTheDocument();
    expect(screen.getByText(/Use Microsoft Azure for the application platform/)).toBeInTheDocument();
    const recorded = await tool(tools, 'get_workspec_workspace_summary').execute({});
    expect(recorded.files).toEqual(expect.arrayContaining([
      '.workspec/decisions/cloud-platform.yaml',
      '.workspec/topologies/azure.yaml',
      '.workspec/resources/web-app.yaml',
    ]));
    const bundle = await tool(tools, 'export_workspec_bundle').execute({});
    expect(bundle).toMatchObject({ filename: 'fieldstate-ledger-workspec.zip', mediaType: 'application/zip', encoding: 'base64' });
    expect(typeof bundle.data).toBe('string');
  }, 20_000);
});
