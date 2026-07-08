import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadC4Model } from '@workspec/c4-model';
import { createFsSource } from '@workspec/c4-model/fs';
import { renderDiagramToSvg } from './render-diagram.js';

// The representative fixture c4-schema/c4-model/c4-layout/c4-ui already
// exercise for conformance: every supported element kind, a c4-context
// diagram with a `.layout/` pin, and a c4-container diagram laid out fully
// auto — a good determinism + golden-shape exercise for this package too.
const REPRESENTATIVE_DIR = fileURLToPath(
  new URL('../../c4-schema/test/fixtures/representative', import.meta.url),
);

describe('renderDiagramToSvg', () => {
  it('is deterministic — two runs against the same tree produce byte-identical SVG', async () => {
    const model = await loadC4Model(createFsSource(REPRESENTATIVE_DIR));
    const first = await renderDiagramToSvg(model, 'system-context');
    const second = await renderDiagramToSvg(model, 'system-context');
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(first.svg).toBe(second.svg);
  });

  it('renders the pinned system-context diagram to valid, self-contained SVG', async () => {
    const model = await loadC4Model(createFsSource(REPRESENTATIVE_DIR));
    const result = await renderDiagramToSvg(model, 'system-context');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('Architect');
    expect(result.svg).toContain('Payment Gateway');
    expect(result.svg).toMatchSnapshot();
  });

  it('renders a c4-container diagram (lensViews) via its logical lens', async () => {
    const model = await loadC4Model(createFsSource(REPRESENTATIVE_DIR));
    const result = await renderDiagramToSvg(model, 'container');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    // Every node in this fixture is a typed ref (`{domain: billing}`, etc.),
    // so all four resolve under both lenses — only the EDGE set differs
    // (the api-server->primary-db edge is `lens: deployment`-only).
    expect(result.svg).toContain('Billing');
    expect(result.svg).toContain('API Server');
    expect(result.svg).toContain('Primary Database');
    expect(result.svg).toContain('Event Bus');
  });

  it('reports the available diagram slugs for an unknown slug', async () => {
    const model = await loadC4Model(createFsSource(REPRESENTATIVE_DIR));
    const result = await renderDiagramToSvg(model, 'does-not-exist');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.availableSlugs).toEqual(expect.arrayContaining(['system-context', 'container']));
  });
});
