import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('connected Studio workflow', () => {
  it('authors elements from the floating canvas toolbar', async () => {
    window.history.pushState({}, '', '/studio/design');
    installModelContext();
    render(<StudioApp />);

    expect(await screen.findByRole('dialog', { name: 'Name your system' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'System name' }), { target: { value: 'Reporting platform' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Name your system' })).not.toBeInTheDocument());
    expect(screen.getAllByText('Reporting platform').length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: 'system: Reporting platform' })).toBeInTheDocument();

    expect(screen.getByRole('group', { name: 'C4 level' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Add architecture element' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Element details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Person' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add External system' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Container' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Database' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Queue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Connection' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add Person' }));
    expect(screen.getByPlaceholderText('e.g. Operations coordinator')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('How does this person use the system?')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Element name' }), { target: { value: 'Reporting Analyst' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Element description' }), { target: { value: 'Reviews operational reports.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to model' }));
    await waitFor(() => expect(screen.getAllByText('Reporting Analyst').length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByRole('button', { name: 'actor: Reporting Analyst' }));
    expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Element name' })).toHaveValue('Reporting Analyst');
    fireEvent.change(screen.getByRole('textbox', { name: 'Element name' }), { target: { value: 'Reporting Specialist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('button', { name: 'actor: Reporting Specialist' })).toBeInTheDocument();

    const addConnection = screen.getByRole('button', { name: 'Add Connection' });
    expect(addConnection).toBeEnabled();
    fireEvent.click(addConnection);
    expect(screen.getByRole('combobox', { name: 'Connection from' })).toHaveValue('system');
    expect(screen.getByRole('combobox', { name: 'Connection to' })).toHaveValue('reporting-analyst');
    fireEvent.change(screen.getByRole('textbox', { name: 'Connection description' }), { target: { value: 'Reviews reports' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connection: Reviews reports' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse model elements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 Infrastructure' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: /Elements/ }));
    expect(screen.getByRole('button', { name: 'Build infrastructure plan →' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse model elements' }));
    expect(screen.queryByRole('button', { name: 'Build infrastructure plan →' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand model elements' }));
    expect(screen.getByRole('button', { name: 'Build infrastructure plan →' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build infrastructure plan →' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '2 · Container' }));
    const addDomain = await screen.findByRole('button', { name: 'Add Domain' });
    expect(screen.queryByRole('button', { name: 'Add Container' })).not.toBeInTheDocument();
    fireEvent.click(addDomain);
    expect(screen.getByPlaceholderText('e.g. Authentication')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Element name' }), { target: { value: 'Reporting' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Element description' }), { target: { value: 'Owns report generation.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to model' }));
    await waitFor(() => expect(screen.getAllByText('Reporting').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('tab', { name: 'Deployment' }));
    const addContainer = await screen.findByRole('button', { name: 'Add Container' });
    expect(screen.getByRole('button', { name: 'Add Database' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Domain' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Person' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add External system' })).not.toBeInTheDocument();
    fireEvent.click(addContainer);
    expect(screen.getByPlaceholderText('e.g. Incident API')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What responsibility does this container have?')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Element name' }), { target: { value: 'Reporting API' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Element description' }), { target: { value: 'Builds customer reports.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to model' }));

    await waitFor(() => expect(screen.getAllByText('Reporting API').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Close add element' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Logical' }));
    const reportingDomain = await screen.findByRole('button', { name: 'domain: Reporting' });
    fireEvent.click(within(reportingDomain).getByRole('button', { name: 'Drill into this' }));
    const addComponent = await screen.findByRole('button', { name: 'Add Component' });
    fireEvent.click(addComponent);
    expect(screen.getByRole('combobox', { name: 'Logical domain' })).toHaveValue('reporting');
    expect(screen.getByRole('combobox', { name: 'Deployment container' })).toHaveValue('reporting-api');
    fireEvent.change(screen.getByRole('textbox', { name: 'Element name' }), { target: { value: 'Report builder' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Element description' }), { target: { value: 'Builds the requested report.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to model' }));
    await waitFor(() => expect(screen.getAllByText('Report builder').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: '2 Infrastructure' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build infrastructure plan →' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Build infrastructure plan →' }));
    expect(await screen.findByRole('heading', { name: 'Infrastructure shopping list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 Infrastructure' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '3 Compare' })).toBeDisabled();
  }, 20_000);

  it('exposes WebMCP tools over the same plan and records a visible decision', async () => {
    window.history.pushState({}, '', '/studio/design');
    const tools = installModelContext();
    render(<StudioApp />);

    await waitFor(() => expect(tools.size).toBe(8));
    expect(screen.getByText('WebMCP ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    await waitFor(() => expect(screen.getByText('Stormglass')).toBeInTheDocument());
    const summary = await tool(tools, 'get_workspec_workspace_summary').execute({});
    expect(summary).toMatchObject({ project: 'Stormglass', requirements: 6 });
    const layout = await tool(tools, 'get_c4_layout').execute({ diagramSlug: 'container' });
    expect(layout).toMatchObject({ diagramSlug: 'container', type: 'c4-container' });
    expect(layout.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'incident-management', kind: 'domain' })]));
    await act(async () => {
      await tool(tools, 'set_c4_layout').execute({ diagramSlug: 'container', mode: 'merge', positions: [{ id: 'incident-management', x: 120, y: 80 }] });
    });
    expect((await tool(tools, 'get_c4_layout').execute({ diagramSlug: 'container' })).layout).toMatchObject({ nodes: { 'incident-management': { x: 120, y: 80 } } });
    fireEvent.click(await screen.findByRole('button', { name: 'system: Stormglass' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Element description' }), { target: { value: 'Coordinates storm response and field restoration.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(async () => {
      expect((await tool(tools, 'get_c4_layout').execute({ diagramSlug: 'container' })).layout).toMatchObject({ nodes: { 'incident-management': { x: 120, y: 80 } } });
    });

    const before = await tool(tools, 'compare_cloud_providers').execute({});
    await act(async () => {
      await tool(tools, 'update_infrastructure_requirements').execute({ changes: [{ id: 'operations-web', size: 'large', quantity: 2 }] });
    });
    const after = await tool(tools, 'compare_cloud_providers').execute({});
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));

    await expect(tool(tools, 'update_infrastructure_requirements').execute({ changes: [{ id: 'missing', size: 'large' }] })).rejects.toThrow('Unknown requirement');
    expect((await tool(tools, 'get_workspec_workspace_summary').execute({})).requirements).toBe(6);

    await act(async () => {
      await tool(tools, 'record_cloud_decision').execute({ provider: 'azure', rationale: 'Best operational fit.' });
    });
    expect(await screen.findByText('Decision recorded')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Use Microsoft Azure for the application platform' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit decision' }));
    expect(screen.getByRole('heading', { name: 'Edit the decision' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Microsoft Azure/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rationale' }), { target: { value: 'Best operational fit, with the clearest managed-service path.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update ADR' }));
    expect(await screen.findByText('Best operational fit, with the clearest managed-service path.')).toBeInTheDocument();
    const recorded = await tool(tools, 'get_workspec_workspace_summary').execute({});
    expect(recorded.files).toEqual(expect.arrayContaining([
      '.workspec/decisions/cloud-platform.yaml',
      '.workspec/topologies/azure.yaml',
      '.workspec/resources/operations-web.yaml',
    ]));
    const bundle = await tool(tools, 'export_workspec_bundle').execute({});
    expect(bundle).toMatchObject({ filename: 'stormglass-workspec.zip', mediaType: 'application/zip', encoding: 'base64' });
    expect(typeof bundle.data).toBe('string');
  }, 20_000);
});
