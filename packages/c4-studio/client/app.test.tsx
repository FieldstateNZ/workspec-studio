// @vitest-environment jsdom
//
// The served page, end to end (A1 #131 + A2 #132). The adversarial review's
// blocking finding was that A2's client half was DEAD CODE — nothing on the
// page installed it, so the canvas was read-only. This suite is the guard:
// it drives a real canvas delete gesture through the real React page,
// against a REAL host server over a REAL temp working tree, and asserts the
// DIAGRAM-SCOPED route fired and the refetched model dropped the node.
//
// Only one seam is faked: `fetch` is pointed at the test server's origin,
// because the page (correctly) talks same-origin relative URLs and jsdom
// has no server behind its own origin. Everything past that is production
// code — real routes, real YAML files on disk.

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseDiagramYaml } from '@workspec/c4-schema';
import { createServer } from '../src/server.js';
import { App } from './app.js';

// Resolved from the package root (vitest's cwd), not `import.meta.url`:
// under the jsdom environment `import.meta.url` is an http:// URL, so
// `fileURLToPath` on it throws.
const REPRESENTATIVE_DIR = join(process.cwd(), '../c4-schema/test/fixtures/representative');

let dir: string;
let server: Server;
let base: string;
let realFetch: typeof globalThis.fetch;
/** Every request the page made, in order — the assertion surface for "which route fired". */
let calls: { method: string; url: string; body: string | null }[];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-page-'));
  await cp(REPRESENTATIVE_DIR, dir, { recursive: true });
  server = createServer({ dir }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const absolute = url.startsWith('/') ? `${base}${url}` : url;
    calls.push({
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return realFetch(absolute, init);
  }) as typeof globalThis.fetch;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The requests the page made to a given route, newest last. */
function callsTo(method: string, path: string): typeof calls {
  return calls.filter((c) => c.method === method && c.url.startsWith(path));
}

describe('the served page installs the studio canvas host (A2 was dead code before this)', () => {
  it('deleting a selected node hits the DIAGRAM-SCOPED route and the refetched model drops it', async () => {
    calls = [];
    const { container } = render(<App />);

    // The page loads the model and opens on the context diagram.
    const node = await screen.findByRole('button', { name: /actor: Architect/i }, {
      timeout: 5000,
    });
    // The on-canvas crumb names the diagram on screen (disabled — the crumb
    // does not switch diagrams).
    expect(screen.getByRole('button', { name: 'System Context' })).toBeDisabled();

    // Select it, then press Delete on the canvas — the gesture C4Diagram
    // only arms when a host has been installed on the instance.
    fireEvent.click(node);
    const canvas = container.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(canvas, { key: 'Delete' });

    // The diagram-scoped route, NOT `DELETE /api/elements`.
    await waitFor(() => {
      expect(callsTo('DELETE', '/api/diagram-nodes')).toHaveLength(1);
    });
    expect(callsTo('DELETE', '/api/elements')).toHaveLength(0);
    expect(JSON.parse(callsTo('DELETE', '/api/diagram-nodes')[0]?.body ?? '{}')).toEqual({
      diagram: 'system-context',
      node: 'architect',
    });

    // …the write triggered a refetch…
    await waitFor(() => {
      expect(callsTo('GET', '/api/model').length).toBeGreaterThanOrEqual(2);
    });

    // …and the reconciled page no longer shows the node on this diagram,
    // with no write-error banner raised.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /actor: Architect/i })).toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    // The refetch kept the user on their diagram rather than resetting.
    expect(screen.getByRole('button', { name: 'System Context' })).toBeDisabled();

    // The files agree: the node ref is gone from the diagram, the element
    // FILE survives (diagram-scoped, per the lead's ruling).
    const parsed = parseDiagramYaml(
      await readFile(join(dir, '.workspec/diagrams/system-context.yaml'), 'utf8'),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data.nodes).toEqual([{ 'external-system': 'payment-gateway' }]);
    expect(await readFile(join(dir, '.workspec/actors/architect.yaml'), 'utf8')).toContain(
      'title: Architect',
    );
  });

  it('a failed write surfaces in the shell’s banner instead of failing silently', async () => {
    calls = [];
    render(<App />);
    const node = await screen.findByRole(
      'button',
      { name: /external-system: Payment Gateway/i },
      { timeout: 5000 },
    );

    // Make the write fail at the network edge, the way a dropped host does.
    const failing = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (init?.method === 'DELETE') return Promise.reject(new Error('host unreachable'));
        return realFetch(url.startsWith('/') ? `${base}${url}` : url, init);
      });

    fireEvent.click(node);
    const canvas = document.querySelector('.c4-diagram') as HTMLElement;
    fireEvent.keyDown(canvas, { key: 'Delete' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('host unreachable');
    failing.mockRestore();
  });
});

describe('the served page — headless explorer, nav switches, crumb labels (owner rulings)', () => {
  it('renders NO level-tab header and no diagrams sidebar', async () => {
    calls = [];
    render(<App />);
    await screen.findByRole('navigation', { name: 'Diagrams' }, { timeout: 5000 });

    expect(screen.queryByRole('group', { name: 'C4 level' })).toBeNull();
    expect(screen.queryByText(/diagrams ▸/)).toBeNull();
    expect(screen.queryByRole('complementary', { name: /sidebar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).toBeNull();
  });

  it('the canvas carries a crumb only — no switching affordance floats over the diagram', async () => {
    calls = [];
    const { container } = render(<App />);
    await screen.findByRole('navigation', { name: 'Diagrams' }, { timeout: 5000 });

    const main = container.querySelector('.c4sh-main') as HTMLElement;
    // Enterprise's crumb is plain buttons — nothing on the canvas opens a
    // popup, and the nav is not duplicated there.
    expect(within(main).queryByRole('listbox')).toBeNull();
    expect(within(main).queryByRole('menu')).toBeNull();
    expect(within(main).queryByRole('navigation', { name: 'Diagrams' })).toBeNull();
    expect(within(main).getByRole('button', { name: 'System Context' })).toBeDisabled();
  });

  it('picking a diagram in the TOP-BAR nav switches the canvas and relabels the crumb', async () => {
    calls = [];
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Diagrams' }, { timeout: 5000 });

    fireEvent.click(within(nav).getByRole('button', { name: /Container/ }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'System Context' })).toBeNull();
    });
    expect(within(nav).getByRole('button', { name: /Container/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Switching is pure navigation — it must never write.
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('mounts NO minimap — enterprise renders none on the architecture canvas', async () => {
    calls = [];
    // Give jsdom real boxes: the minimap self-gates on a measured viewport,
    // so without this the assertion would pass even if it were switched on.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1280,
      height: 800,
      top: 0,
      left: 0,
      right: 1280,
      bottom: 800,
      toJSON: () => ({}),
    } as DOMRect);
    const { container } = render(<App />);
    // Wait on the ZOOM cluster, not the nav: the nav appears as soon as the
    // model lands, but canvas chrome only mounts after the async layout —
    // asserting before that would pass vacuously. The zoom cluster is also
    // the control enterprise DOES render on this canvas, so it doubles as
    // the positive half of this comparison.
    await screen.findByRole('button', { name: 'Fit view' }, { timeout: 5000 });

    // The minimap's fixed 192×128 panel SVG.
    expect(container.querySelector('svg[width="192"]')).toBeNull();
  });
});
