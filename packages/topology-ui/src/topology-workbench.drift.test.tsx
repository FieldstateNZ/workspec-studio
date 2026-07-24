import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemorySource } from '@workspec/topology-model';
import type { TopologyFileSource } from '@workspec/topology-model';
import { TopologyStudioProvider } from './context.js';
import { createInertLinkResolver } from './host.js';
import type { TopologyStudioHost } from './host.js';
import { buildDriftedWebAppDerivedTopology } from './test-helpers/build-drift-fixture.js';
import { readWebAppFixtureSeed } from './test-helpers/read-web-app-fixture.js';
import { TopologyWorkbench } from './topology-workbench.js';

let source: TopologyFileSource;

beforeEach(async () => {
  source = createMemorySource(await readWebAppFixtureSeed());
});

function renderWorkbench(host: TopologyStudioHost): ReturnType<typeof render> {
  return render(
    <TopologyStudioProvider host={host}>
      <TopologyWorkbench />
    </TopologyStudioProvider>,
  );
}

async function goToDrift(): Promise<void> {
  const user = userEvent.setup();
  await screen.findByText('Web App');
  await user.click(screen.getByRole('button', { name: 'Drift' }));
}

describe('TopologyWorkbench — Drift view', () => {
  it('shows a clean empty state when the host has no loadDerived at all — never crashes', async () => {
    const host: TopologyStudioHost = { source, links: createInertLinkResolver(), capabilities: { editLayout: false } };
    renderWorkbench(host);
    await goToDrift();

    await waitFor(() => {
      expect(screen.getByText(/No actual state imported/)).toBeInTheDocument();
    });
    expect(screen.getByText(/workspec-topology import/)).toBeInTheDocument();
  });

  it('shows the same empty state when loadDerived resolves to null (nothing imported yet)', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadDerived: async () => null,
    };
    renderWorkbench(host);
    await goToDrift();

    await waitFor(() => {
      expect(screen.getByText(/No actual state imported/)).toBeInTheDocument();
    });
  });

  it('renders all four drift classes with distinct shapes, counts, and the CI affordance, given a drifted derived topology', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadDerived: async () => buildDriftedWebAppDerivedTopology(),
    };
    renderWorkbench(host);
    await goToDrift();

    const panel = await screen.findByRole('complementary', { name: 'Drift' });
    const scoped = within(panel);

    // One of each class in this fixture — see build-drift-fixture.ts.
    expect(scoped.getByText('Phantom')).toBeInTheDocument();
    expect(scoped.getByText('Orphan')).toBeInTheDocument();
    expect(scoped.getByText('Divergent')).toBeInTheDocument();
    expect(scoped.getByText('Mis-wired')).toBeInTheDocument();

    // Every class's glyph is a structurally distinct SVG (colour-blind-safe
    // shape, not hue alone) — same "distinct shapes" assertion style as
    // `drift-glyph.test.tsx`, exercised here through the real panel markup.
    const glyphs = panel.querySelectorAll('.tp-drift-chip svg');
    const shapes = new Set([...glyphs].map((svg) => svg.innerHTML));
    expect(glyphs.length).toBe(4);
    expect(shapes.size).toBe(4);

    expect(scoped.getByText('$ workspec-topology reconcile')).toBeInTheDocument();
    expect(scoped.getByText('CI exit 1')).toBeInTheDocument();

    // The orphan resource renders as an extra canvas card (dotted treatment).
    const canvas = document.querySelector('.tp-canvas');
    expect(canvas).not.toBeNull();
    expect(within(canvas as HTMLElement).getByRole('button', { name: /Diagnostics storage/ })).toHaveClass(
      'tp-node-drift-orphan',
    );

    // The mis-wired bypass renders as a ghost (danger, dashed) edge.
    const ghostPath = canvas?.querySelector('svg.tp-edges path[stroke="var(--danger)"]');
    expect(ghostPath).not.toBeNull();
  });

  it('opens a phantom resource\'s detail from the drift list, showing its recon message', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadDerived: async () => buildDriftedWebAppDerivedTopology(),
    };
    renderWorkbench(host);
    await goToDrift();

    const panel = await screen.findByRole('complementary', { name: 'Drift' });
    const user = userEvent.setup();
    await user.click(within(panel).getByRole('button', { name: /Application Insights/ }));

    await waitFor(() => {
      expect(within(panel).getByText(/declared in the authored topology/)).toBeInTheDocument();
    });
  });

  it('opens an orphan resource\'s detail from the drift list', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadDerived: async () => buildDriftedWebAppDerivedTopology(),
    };
    renderWorkbench(host);
    await goToDrift();

    const panel = await screen.findByRole('complementary', { name: 'Drift' });
    const user = userEvent.setup();
    await user.click(within(panel).getByRole('button', { name: /Diagnostics storage/ }));

    await waitFor(() => {
      expect(within(panel).getByText('Azure Storage Account')).toBeInTheDocument();
    });
    expect(within(panel).getByText(/declared nowhere in the authored topology/)).toBeInTheDocument();
  });

  it('returning to the Topology view clears the selection and the drift/orphan canvas treatment', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadDerived: async () => buildDriftedWebAppDerivedTopology(),
    };
    renderWorkbench(host);
    await goToDrift();
    await screen.findByRole('complementary', { name: 'Drift' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Topology' }));

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Drift' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('complementary', { name: 'Topology resources' })).toBeInTheDocument();
  });
});
