// @vitest-environment jsdom
//
// The A3 authoring loop (#133), end to end: the owner's literal ask —
// "add a new box, label it" — plus connect, rename, edit and delete, each
// driven as a REAL gesture on the REAL page against a REAL host server over
// a REAL temp working tree. Every assertion lands on the YAML on disk,
// re-parsed through `@workspec/c4-schema`, so "the write happened" and "the
// write is schema-valid" are the same check.
//
// Only `fetch` is faked, and only to point same-origin relative URLs at the
// test server's port (same seam, same reason as `app.test.tsx`). The
// gestures, the canvas engine, the mutation queue, the byte-splice YAML
// editor and the routes are all production code.
//
// The unit-level guards for these surfaces (Escape precedence, the
// Backspace typing locks, palette derivation, viewer inertness) live in
// `@workspec/c4-ui`'s `c4-authoring.test.tsx`, each with a stated mutation.
// This file asks the complementary question those cannot: does the file on
// disk actually change?

import { cp, mkdtemp, readFile, rm, access } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDiagramYaml } from '@workspec/c4-schema';
import { createServer } from '../src/server.js';
import { App } from './app.js';

const REPRESENTATIVE_DIR = join(process.cwd(), '../c4-schema/test/fixtures/representative');

let dir: string;
let server: Server;
let base: string;
let realFetch: typeof globalThis.fetch;
let calls: { method: string; url: string; body: string | null }[];

beforeAll(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return realFetch(url.startsWith('/') ? `${base}${url}` : url, init);
  }) as typeof globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// A FRESH tree per test — these tests write files, so a shared tree would
// make them order-dependent (the factories-not-fixtures rule, applied to a
// working directory).
beforeEach(async () => {
  calls = [];
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-a3-'));
  await cp(REPRESENTATIVE_DIR, dir, { recursive: true });
  server = createServer({ dir }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

function callsTo(method: string, path: string): typeof calls {
  return calls.filter((c) => c.method === method && c.url.startsWith(path));
}

/** The canvas engine root — where the pointer pipeline's listeners live. */
function canvasRoot(): Element {
  const root = document.querySelector('[data-canvas-root]');
  if (!root) throw new Error('canvas root missing');
  return root;
}

/** The `.c4-diagram` container — the page's keyboard surface. */
function canvasKeys(): HTMLElement {
  return document.querySelector('.c4-diagram') as HTMLElement;
}

/**
 * jsdom has no `PointerEvent`; `fireEvent.pointerDown` silently degrades to
 * a plain `Event`, which drops `clientX`/`clientY`. Same workaround c4-ui's
 * `test-helpers/fire-pointer.ts` uses, restated here because the two
 * packages do not share test helpers.
 */
function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  props: { clientX: number; clientY: number; button?: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, ...props });
  fireEvent(element, event);
}

function clickAt(at: { clientX: number; clientY: number }): void {
  firePointer(canvasRoot(), 'pointerdown', at);
  firePointer(canvasRoot(), 'pointerup', at);
}

function rightClickAt(at: { clientX: number; clientY: number }): void {
  firePointer(canvasRoot(), 'pointerdown', { ...at, button: 2 });
  firePointer(canvasRoot(), 'pointerup', { ...at, button: 2 });
}

/**
 * The centre of a rendered card, in client coordinates.
 *
 * Read off the shape wrapper's own `translate3d(...)`, which the engine
 * writes as the card's SCREEN centre (`components/shape.tsx:88`). Taking it
 * from the render rather than from the layout keeps the gesture aimed at
 * whatever the layout actually produced. Screen === client here: zero jsdom
 * rects, identity camera.
 */
function centerOfCard(accessibleName: RegExp): { clientX: number; clientY: number } {
  const wrapper = screen.getByRole('button', { name: accessibleName });
  const holder = wrapper.closest('[style*="translate3d"]') as HTMLElement | null;
  const match = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(holder?.style.transform ?? '');
  if (!match) throw new Error(`no positioned wrapper for ${String(accessibleName)}`);
  return { clientX: Number(match[1]), clientY: Number(match[2]) };
}

/**
 * The screen position of an edge's midpoint label pill.
 *
 * `ConnectorLayer` renders the pill at `pageToScreen(geom.label)` as inline
 * `left`/`top`, so this reads the route the engine actually computed rather
 * than guessing a midpoint — and it is the point the pipeline hit-tests
 * against when the double-click opens the label editor. The layer also
 * emits a visually-hidden copy of the same text for the a11y tree, so the
 * positioned one is picked explicitly.
 */
function centerOfEdgeLabel(text: string): { clientX: number; clientY: number } {
  const pill = screen
    .getAllByText(text)
    .map((node) => node.closest('[style*="left"]') as HTMLElement | null)
    .find((node): node is HTMLElement => node !== null && node.style.left !== '');
  if (!pill) throw new Error(`no positioned label pill for ${text}`);
  return {
    clientX: Number.parseFloat(pill.style.left),
    clientY: Number.parseFloat(pill.style.top),
  };
}

/** The `.c4-el` card — double-click is bound there, not on the a11y wrapper. */
function cardOf(accessibleName: RegExp): HTMLElement {
  const card = screen.getByRole('button', { name: accessibleName }).querySelector('.c4-el');
  if (!card) throw new Error(`no card for ${String(accessibleName)}`);
  return card as HTMLElement;
}

/** Renders the page and waits for the context diagram's cards to land. */
async function openPage(): Promise<void> {
  render(<App />);
  await screen.findByRole('button', { name: /actor: Architect/i }, { timeout: 5000 });
}

async function readDiagram(slug: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const parsed = parseDiagramYaml(
    await readFile(join(dir, `.workspec/diagrams/${slug}.yaml`), 'utf8'),
  );
  if (!parsed.ok) throw new Error('the diagram no longer parses against the schema');
  return { nodes: parsed.data.nodes ?? [], edges: parsed.data.edges ?? [] };
}

describe('A3 place loop — "add a new box, label it" (the owner’s ask)', () => {
  it('palette → canvas click → inline name → the element FILE and the diagram node ref both land', async () => {
    await openPage();

    // 1. Arm the palette. The context diagram offers enterprise's context
    //    palette (actor + external system).
    fireEvent.click(screen.getByRole('button', { name: 'Add Actor' }));

    // 2. Click empty canvas — a pending card appears, already in its editor.
    clickAt({ clientX: 900, clientY: 620 });
    const input = await screen.findByPlaceholderText(/Name this actor/i);
    // Nothing is written until it is named.
    expect(callsTo('POST', '/api/elements')).toHaveLength(0);

    // 3. Name it and commit — with ENTER ALONE. The editor's own keydown
    //    handler is what blurs the input, and the blur is what commits
    //    (`c4-node-component.tsx`'s `LabelEditor`, ported verbatim from
    //    enterprise). A test that fires `blur` itself would still pass with
    //    the Enter branch deleted, which is precisely how a broken
    //    "press Enter and nothing happens" shipped green.
    fireEvent.change(input, { target: { value: 'Compliance Auditor' } });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(callsTo('POST', '/api/elements')).toHaveLength(1);
    });
    expect(JSON.parse(callsTo('POST', '/api/elements')[0]?.body ?? '{}')).toMatchObject({
      kind: 'actor',
      name: 'Compliance Auditor',
      diagram: 'system-context',
      // The card's TOP-LEFT, not the click point: `commitNewNode` hands
      // over `{ shape.x, shape.y }`, and `placeNode` centred the card on
      // the cursor (C4_NODE_WIDTH/2 = 150, C4_NODE_HEIGHT/2 = 55). Pins in
      // `.layout/` are top-left, so this is the coordinate space that
      // round-trips.
      position: { x: 750, y: 565 },
    });

    // 4. The element file exists, with the authored title…
    await waitFor(async () => {
      expect(
        await readFile(join(dir, '.workspec/actors/compliance-auditor.yaml'), 'utf8'),
      ).toContain('title: Compliance Auditor');
    });

    // 5. …and this diagram now references it, as a TYPED ref
    //    (`create-element.ts:107` writes `{ [kind]: slug }`, which is what
    //    keeps the kind unambiguous without a loader lookup).
    await waitFor(async () => {
      expect((await readDiagram('system-context')).nodes).toContainEqual({
        actor: 'compliance-auditor',
      });
    });

    // 6. The refetched page shows the real card, and nothing errored.
    await screen.findByRole('button', { name: /actor: Compliance Auditor/i }, { timeout: 5000 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Escape while placing cancels the mode and writes nothing', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add Actor' }));
    expect(document.querySelector('.c4-place-hint')).not.toBeNull();

    fireEvent.keyDown(canvasKeys(), { key: 'Escape' });

    expect(document.querySelector('.c4-place-hint')).toBeNull();
    clickAt({ clientX: 900, clientY: 620 });
    expect(screen.queryByPlaceholderText(/Name this/i)).toBeNull();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('abandoning the name discards the card locally — no half-created element', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add Actor' }));
    clickAt({ clientX: 900, clientY: 620 });
    const input = await screen.findByPlaceholderText(/Name this actor/i);

    // Escape alone, same reasoning as the commit path above.
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Name this actor/i)).toBeNull();
    });
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});

describe('A3 connect loop — dragging between two cards writes the relation', () => {
  it('architect → payment gateway lands as an edge in the diagram file', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    const from = centerOfCard(/actor: Architect/i);
    const to = centerOfCard(/external-system: Payment Gateway/i);
    firePointer(canvasRoot(), 'pointerdown', from);
    firePointer(canvasRoot(), 'pointermove', to);
    firePointer(canvasRoot(), 'pointerup', to);

    await waitFor(() => {
      expect(callsTo('POST', '/api/relations')).toHaveLength(1);
    });
    expect(JSON.parse(callsTo('POST', '/api/relations')[0]?.body ?? '{}')).toMatchObject({
      diagram: 'system-context',
      from: 'architect',
      to: 'payment-gateway',
    });

    await waitFor(async () => {
      expect((await readDiagram('system-context')).edges).toContainEqual(
        expect.objectContaining({ from: 'architect', to: 'payment-gateway' }),
      );
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('A3 edge label — the `__system__` alias must not swallow the write', () => {
  // The resolver rewrites a diagram's `__system__` to the system element's
  // real slug and keeps no record of the original token, so the canvas
  // addresses this edge as `architect -> main-system` while the file says
  // `architect -> __system__`. Matching the raw strings server-side made
  // every gesture on such an edge a silent 404 with the edge plainly on
  // screen — the mutation that dies here is restoring that raw comparison
  // in `rename-relation.ts`.
  it('renaming an edge authored against __system__ lands, and keeps the alias in the file', async () => {
    await openPage();

    // The label editor opens off the ENGINE's synthesised double-click (two
    // pointerdowns inside 300ms at the same point), not a DOM `dblclick` —
    // the same route the user's mouse takes.
    const at = centerOfEdgeLabel('designs systems in');
    clickAt(at);
    clickAt(at);
    const input = await screen.findByDisplayValue('designs systems in');
    fireEvent.change(input, { target: { value: 'owns the architecture of' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(callsTo('PATCH', '/api/relations')).toHaveLength(1);
    });
    expect(JSON.parse(callsTo('PATCH', '/api/relations')[0]?.body ?? '{}')).toMatchObject({
      from: 'architect',
      to: 'main-system',
      label: 'owns the architecture of',
    });

    await waitFor(async () => {
      expect((await readDiagram('system-context')).edges).toContainEqual(
        // The alias survives: only the label line moved.
        expect.objectContaining({
          from: 'architect',
          to: '__system__',
          label: 'owns the architecture of',
        }),
      );
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('connecting TO the system card authors the alias the diagram can express', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    const from = centerOfCard(/external-system: Payment Gateway/i);
    const to = centerOfCard(/system: Fieldstate Ledger/i);
    firePointer(canvasRoot(), 'pointerdown', from);
    firePointer(canvasRoot(), 'pointermove', to);
    firePointer(canvasRoot(), 'pointerup', to);

    await waitFor(() => {
      expect(callsTo('POST', '/api/relations')).toHaveLength(1);
    });
    // The canvas asks in RESOLVED slugs — the system has no node entry on
    // this diagram, so a raw write of `to: main-system` would be refused
    // (400) as "not a node of diagram".
    expect(JSON.parse(callsTo('POST', '/api/relations')[0]?.body ?? '{}')).toMatchObject({
      from: 'payment-gateway',
      to: 'main-system',
    });
    await waitFor(async () => {
      expect((await readDiagram('system-context')).edges).toContainEqual(
        expect.objectContaining({ from: 'payment-gateway', to: '__system__' }),
      );
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('A3 rename — the context-menu row commits through PATCH /api/elements', () => {
  it('renaming a card rewrites the element file’s title and keeps its slug', async () => {
    await openPage();
    rightClickAt(centerOfCard(/actor: Architect/i));

    // The row acts on pointerdown and MUST cancel that event's default, or
    // the browser focuses the menu button and blurs the editor this click
    // just opened — the edit session then ends on its own before a key can
    // be typed. jsdom performs no focus default, so the guarantee is
    // asserted directly (the live symptom was: Rename does nothing).
    const menuDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    screen.getByRole('button', { name: 'Rename' }).dispatchEvent(menuDown);
    expect(menuDown.defaultPrevented).toBe(true);

    const input = await screen.findByDisplayValue('Architect');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'Principal Architect' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(callsTo('PATCH', '/api/elements')).toHaveLength(1);
    });
    // Slug stability: the FILE keeps its name, only `title:` moves.
    await waitFor(async () => {
      expect(await readFile(join(dir, '.workspec/actors/architect.yaml'), 'utf8')).toContain(
        'title: Principal Architect',
      );
    });
    expect((await readDiagram('system-context')).nodes).toContainEqual({ slug: 'architect' });
  });
});

describe('A3 element editor — full field editing, and the ONE tree-wide delete surface', () => {
  it('the double-click GESTURE reaches the card — the pointer pipeline must not capture it', async () => {
    // The live break this replaces: the canvas root took pointer capture on
    // `pointerdown`, so Chrome retargeted the gesture's `mouseup`/`click`/
    // `dblclick` to the root and the card's own React `onDoubleClick` — the
    // studio's ONLY route to the element editor, since the validity marker
    // that also opens it never renders for a file-backed host — never fired.
    // jsdom implements neither capture nor that retargeting, so the gesture
    // is driven through the REAL pipeline and the invariant the browser
    // behaviour hangs off is asserted alongside the outcome.
    const capture = vi.spyOn(HTMLElement.prototype, 'setPointerCapture');
    await openPage();

    const at = centerOfCard(/actor: Architect/i);
    clickAt(at);
    clickAt(at);
    // The mutation that dies here: capturing in `handlePointerDown`.
    expect(capture).not.toHaveBeenCalled();

    fireEvent.doubleClick(cardOf(/actor: Architect/i));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit element');
  });

  it('double-clicking a card opens it on that element, and Save writes the edited fields', async () => {
    await openPage();
    // Switch to the CONTAINER diagram: the technology field only renders
    // for the four kinds whose schema has it, and the context diagram
    // carries none of them.
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Diagrams' })).getByRole('button', {
        name: /Container/,
      }),
    );
    await screen.findByRole('button', { name: /container: API Server/i }, { timeout: 5000 });
    fireEvent.doubleClick(cardOf(/container: API Server/i));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Edit element');

    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: 'Serves the public REST API and the studio host.' },
    });
    fireEvent.change(screen.getByLabelText(/^Technology/), { target: { value: 'Node.js 22' } });
    fireEvent.change(screen.getByLabelText(/^Tags/), { target: { value: 'edge, public' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(callsTo('PATCH', '/api/elements')).toHaveLength(1);
    });
    await waitFor(async () => {
      expect(await readFile(join(dir, '.workspec/containers/api-server.yaml'), 'utf8')).toContain(
        'Serves the public REST API and the studio host.',
      );
    });
    const file = await readFile(join(dir, '.workspec/containers/api-server.yaml'), 'utf8');
    expect(file).toContain('technology: Node.js 22');
    expect(file).toContain('edge');
    expect(file).toContain('public');
  });

  it('“delete element everywhere” REQUIRES the confirmation before it fires', async () => {
    await openPage();
    fireEvent.doubleClick(cardOf(/actor: Architect/i));
    await screen.findByRole('dialog');

    // The first press only arms the confirmation — nothing is deleted.
    fireEvent.click(screen.getByRole('button', { name: 'Delete element everywhere' }));
    expect(await screen.findByRole('alertdialog', { name: 'Delete element?' })).toBeInTheDocument();
    expect(callsTo('DELETE', '/api/elements')).toHaveLength(0);
    await expect(access(join(dir, '.workspec/actors/architect.yaml'))).resolves.toBeUndefined();

    // Cancel puts it back with the file still there.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(callsTo('DELETE', '/api/elements')).toHaveLength(0);
  });

  it('confirming deletes the FILE and scrubs the node from every diagram', async () => {
    await openPage();
    fireEvent.doubleClick(cardOf(/actor: Architect/i));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete element everywhere' }));
    await screen.findByRole('alertdialog', { name: 'Delete element?' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(callsTo('DELETE', '/api/elements')).toHaveLength(1);
    });
    await waitFor(async () => {
      await expect(access(join(dir, '.workspec/actors/architect.yaml'))).rejects.toThrow();
    });
    // Tree-wide: the diagram no longer references it, and still parses.
    await waitFor(async () => {
      expect((await readDiagram('system-context')).nodes).not.toContainEqual({ slug: 'architect' });
    });
    // The panel closed with the element it was editing.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('Backspace inside the editor’s fields never reaches the canvas delete gesture', async () => {
    await openPage();
    // Select a card first, so the canvas delete branch HAS something to
    // delete — otherwise the assertion would pass vacuously.
    fireEvent.click(screen.getByRole('button', { name: /actor: Architect/i }));
    fireEvent.doubleClick(cardOf(/actor: Architect/i));
    await screen.findByRole('dialog');

    fireEvent.keyDown(screen.getByLabelText(/^Description/), { key: 'Backspace' });
    fireEvent.keyDown(screen.getByLabelText(/^Name/), { key: 'Backspace' });

    expect(callsTo('DELETE', '/api/diagram-nodes')).toHaveLength(0);
    expect(callsTo('DELETE', '/api/elements')).toHaveLength(0);
  });
});
