import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemorySource } from '@workspec/topology-model';
import type { TopologyFileSource } from '@workspec/topology-model';
import { TopologyStudioProvider } from './context.js';
import { createInertLinkResolver } from './host.js';
import type { TopologyStudioHost } from './host.js';
import { loadAzureNzCatalog } from './test-helpers/load-azure-nz-catalog.js';
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

async function goToCost(): Promise<void> {
  const user = userEvent.setup();
  await screen.findByText('Web App');
  await user.click(screen.getByRole('button', { name: 'Cost' }));
}

describe('TopologyWorkbench — Cost view', () => {
  it('shows a clean empty state when the host has no loadCatalog at all — never crashes', async () => {
    const host: TopologyStudioHost = { source, links: createInertLinkResolver(), capabilities: { editLayout: false } };
    renderWorkbench(host);
    await goToCost();

    await waitFor(() => {
      expect(screen.getByText(/No cost catalog configured/)).toBeInTheDocument();
    });
  });

  it('shows the same empty state when loadCatalog resolves to null', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadCatalog: async () => null,
    };
    renderWorkbench(host);
    await goToCost();

    await waitFor(() => {
      expect(screen.getByText(/No cost catalog configured/)).toBeInTheDocument();
    });
  });

  it('renders per-node cost rows, the reservable/schedulable split, and totals — golden against the azure-nz catalog', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadCatalog: async () => loadAzureNzCatalog(),
    };
    renderWorkbench(host);
    await goToCost();

    const panel = await screen.findByRole('complementary', { name: 'Cost' });
    const scoped = within(panel);

    // Golden values locked by `@workspec/topology-cost`'s own prod fixture
    // test (`web-app-cost.test.ts`): all 5 priced resources are PAYG
    // (schedulable), totalling $2,025/mo.
    await waitFor(() => {
      expect(scoped.getByText('Web App Service')).toBeInTheDocument();
    });
    expect(scoped.getByText('Session cache')).toBeInTheDocument();
    expect(scoped.getByText('Front Door')).toBeInTheDocument();
    expect(scoped.getByText('Primary database')).toBeInTheDocument();
    expect(scoped.getByText('Write path function')).toBeInTheDocument();

    // Catalog currency is NZD — `Intl` renders it "NZ$" (vs plain "$" for
    // USD) to disambiguate, so these assertions lock the REAL formatted
    // string rather than assuming a bare "$".
    expect(scoped.getAllByText('NZ$2,025').length).toBeGreaterThanOrEqual(1); // total AND schedulable (all-PAYG fixture)
    expect(scoped.getByText('NZ$0')).toBeInTheDocument(); // reservable/committed — all-PAYG fixture

    // Per-node cost pills render on the canvas too.
    const canvas = document.querySelector('.tp-canvas');
    expect(canvas).not.toBeNull();
    expect(within(canvas as HTMLElement).getByText('NZ$1,470/mo')).toBeInTheDocument(); // app-service, prod override

    // Attribution (byContainer) is surfaced in the panel.
    expect(scoped.getByText(/^api-server/)).toBeInTheDocument();
    expect(scoped.getByText(/^primary-db/)).toBeInTheDocument();
    expect(scoped.getByText('unattributed')).toBeInTheDocument();
  });

  it('opens a priced node\'s detail from the cost list, showing its mode and sku', async () => {
    const host: TopologyStudioHost = {
      source,
      links: createInertLinkResolver(),
      capabilities: { editLayout: false },
      loadCatalog: async () => loadAzureNzCatalog(),
    };
    renderWorkbench(host);
    await goToCost();

    const panel = await screen.findByRole('complementary', { name: 'Cost' });
    const user = userEvent.setup();
    await user.click(await within(panel).findByRole('button', { name: /Web App Service/ }));

    await waitFor(() => {
      expect(within(panel).getByText('schedulable · pay-as-you-go')).toBeInTheDocument();
    });
    expect(within(panel).getByText('p2v3')).toBeInTheDocument();
  });
});
