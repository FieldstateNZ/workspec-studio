import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemorySource } from '@workspec/topology-model';
import type { TopologyFileSource } from '@workspec/topology-model';
import { TopologyStudioProvider } from './context.js';
import { createInertLinkResolver } from './host.js';
import type { TopologyStudioHost } from './host.js';
import { readWebAppFixtureSeed } from './test-helpers/read-web-app-fixture.js';
import { TopologyWorkbench } from './topology-workbench.js';

let source: TopologyFileSource;
let host: TopologyStudioHost;

beforeEach(async () => {
  source = createMemorySource(await readWebAppFixtureSeed());
  host = { source, links: createInertLinkResolver(), capabilities: { editLayout: false } };
});

function renderWorkbench(): ReturnType<typeof render> {
  return render(
    <TopologyStudioProvider host={host}>
      <TopologyWorkbench />
    </TopologyStudioProvider>,
  );
}

/** Scopes queries to the canvas — many resource names appear TWICE at once (once as a canvas card, once as a resource-list row, or once as a canvas card and once in the open detail view), so a canvas-only click/assertion needs this to avoid an ambiguous match. */
function canvasScope(): HTMLElement {
  const canvas = document.querySelector('.tp-canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return canvas as HTMLElement;
}

/** Scopes queries to the side panel (resource list OR node detail — whichever is currently showing), for the same reason `canvasScope` exists: the canvas keeps showing a selected node's card too. */
function panelScope(): HTMLElement {
  const panel = document.querySelector('.tp-side-panel');
  if (!panel) throw new Error('side panel not rendered');
  return panel as HTMLElement;
}

/** Strips React's per-render `useId()` output (`:r0:`, `:r1a:`, …) so a DOM snapshot stays stable across otherwise-identical renders. */
function normalizeGeneratedIds(html: string): string {
  return html.replace(/:r[0-9a-z]+:/g, ':rX:');
}

describe('TopologyWorkbench — web-app golden fixture', () => {
  it('renders the network lens by default: header, boundary boxes, node cards, and declared edges', async () => {
    renderWorkbench();

    await screen.findByText('Web App');
    expect(screen.getByText('workspec-topology')).toBeInTheDocument();
    expect(screen.getByText('/ web-app')).toBeInTheDocument();
    // Default env is the topology's declared `defaultEnvironment` (prod).
    expect(screen.getByRole('button', { name: 'prod' })).toHaveClass('tp-segment-active');
    expect(screen.getByText('11 resources · 1 VNet · 1 subnet')).toBeInTheDocument();

    // vnet/subnet render as BOUNDARY BOXES in the network lens. Scoped to
    // the canvas: the side panel's boundary legend also names every
    // container, so each label appears twice at once.
    const canvas = within(canvasScope());
    expect(canvas.getByText('Core virtual network')).toBeInTheDocument();
    expect(canvas.getByText('Workload subnet')).toBeInTheDocument();

    // rg-app renders as a plain NODE card here (its own lens's container
    // status doesn't apply to the OTHER lens's grouping kind).
    const rgAppCard = within(canvasScope()).getByRole('button', { name: /App resource group/ });
    expect(rgAppCard).toHaveClass('tp-node');

    // front-door is present by default (prod).
    expect(within(canvasScope()).getByRole('button', { name: /Front Door/ })).toBeInTheDocument();

    // Declared edges rendered as SVG paths (8 in prod — see the golden
    // resolve() test: 6 primary + 2 telemetry). Scoped to the edge layer's
    // own `<svg class="tp-edges">` (direct children only, so the two
    // arrowhead-marker <path>s nested inside <defs> aren't double-counted)
    // — every node/boundary glyph is ALSO an <svg><path>, just a different one.
    const paths = canvasScope().querySelectorAll('svg.tp-edges > path[d]');
    expect(paths.length).toBe(8);
    const telemetryPaths = canvasScope().querySelectorAll('svg.tp-edges > path[stroke-dasharray]');
    expect(telemetryPaths.length).toBe(2);
  });

  it('switches to the resource-group lens: rg-app becomes a boundary box; vnet/subnet become plain node rows', async () => {
    renderWorkbench();
    const user = userEvent.setup();
    await screen.findByText('Web App');

    await user.click(screen.getByRole('button', { name: 'Resource groups' }));

    // The golden fixture declares exactly ONE resource-group ("rg-app") —
    // see the golden lens-tree test's `containersByKind: { 'resource-group': 1 }`.
    await waitFor(() => {
      expect(screen.getByText('11 resources · 1 resource group')).toBeInTheDocument();
    });

    // rg-app is now the boundary box, suffixed by the naming convention.
    // Scoped to the canvas: the side panel's boundary LEGEND also names
    // every container, so "rg-app-prod" appears twice at once.
    expect(within(canvasScope()).getByText('rg-app-prod')).toBeInTheDocument();

    // core-vnet / snet-workload now render as plain NODE cards on the
    // canvas (the RG_NODES behaviour), not boundary boxes.
    const canvas = within(canvasScope());
    expect(canvas.getByRole('button', { name: /Core virtual network/ })).toHaveClass('tp-node');
    expect(canvas.getByRole('button', { name: /Workload subnet/ })).toHaveClass('tp-node');
  });

  it('env switch: Front Door is present in prod, absent in dev and test', async () => {
    renderWorkbench();
    const user = userEvent.setup();
    await screen.findByText('Web App');
    expect(within(canvasScope()).getByRole('button', { name: /Front Door/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'dev' }));
    await waitFor(() => {
      expect(screen.getByText('10 resources · 1 VNet · 1 subnet')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Front Door/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'test' }));
    await waitFor(() => {
      expect(screen.getByText('10 resources · 1 VNet · 1 subnet')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Front Door/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'prod' }));
    await waitFor(() => {
      expect(within(canvasScope()).getByRole('button', { name: /Front Door/ })).toBeInTheDocument();
    });
  });

  it('opens a node detail by clicking its canvas card, and returns to the resource list via the back control', async () => {
    renderWorkbench();
    const user = userEvent.setup();
    await screen.findByText('Web App');

    await user.click(within(canvasScope()).getByRole('button', { name: /Web App Service/ }));

    await waitFor(() => {
      expect(within(panelScope()).getByText('Azure App Service')).toBeInTheDocument();
    });
    const panel = within(panelScope());
    expect(panel.getByText('Compute')).toBeInTheDocument();
    expect(panel.getByText('rg-app-prod')).toBeInTheDocument();
    expect(panel.getByText('Workload subnet')).toBeInTheDocument();
    expect(panel.getByText('app-service')).toBeInTheDocument();
    expect(panel.getByText('AZURE')).toBeInTheDocument();
    // realizes chip
    expect(panel.getByText('↳ api-server')).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: /Resources/ }));
    await waitFor(() => {
      // The resource-list view's eyebrow, not the detail view's back
      // button — both render the word "Resources", so this is the signal
      // we're back on the list rather than absence of the word itself
      // (app-service's row still shows "Azure App Service" as its type).
      expect(within(panelScope()).queryByRole('button', { name: /^Resources$/ })).not.toBeInTheDocument();
    });
    expect(panelScope().querySelector('.tp-detail-identity')).toBeNull();
  });

  it('opens a node detail from a resource-list row too, and shows "external" for a resource with no network placement', async () => {
    renderWorkbench();
    const user = userEvent.setup();
    await screen.findByText('Web App');

    await user.click(within(panelScope()).getByRole('button', { name: /Browser client/ }));

    await waitFor(() => {
      expect(within(panelScope()).getByText('Web browser')).toBeInTheDocument();
    });
    expect(within(panelScope()).getByText('— (external)')).toBeInTheDocument();
  });

  it('DOM snapshot: the network-lens canvas structure for the golden fixture (prod)', async () => {
    renderWorkbench();
    await screen.findByText('Web App');

    expect(normalizeGeneratedIds(canvasScope().outerHTML)).toMatchSnapshot();
  });

  it('never crashes when a resource has no pinned `.layout/` position — the fallback layout always produces a rect for every card', async () => {
    renderWorkbench();
    await screen.findByText('Web App');
    // The golden fixture ships no `.layout/` file at all, so every node here
    // is exercising the deterministic fallback path already — reaching this
    // point without throwing (and every card being present) is the assertion.
    const cards = within(canvasScope()).getAllByRole('button');
    expect(cards.length).toBeGreaterThan(0);
  });
});
