// Smoke test over the REAL 80-resource "fieldstate-azure" demo estate —
// cost-engine's own golden fixture, loaded from YAML on disk (not the
// compact hand-built test estate the other test files use) — proving the
// workbench renders correctly at the size and shape the design handoff was
// actually built against (81.2% coverage is cost-engine's own pinned oracle
// number; see its `golden.test.ts`).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryRepository, parseAttributionYaml, parseInventoryYaml, parseSpendYaml } from '@workspec/cost-schema';
import { AttributionWorkbench } from './attribution-workbench.js';
import { CostStudioProvider } from './context.js';

// Deliberately NOT `new URL('../relative', import.meta.url)`: Vite's import
// analysis pattern-matches that exact literal `new URL(str, import.meta.url)`
// syntax and rewrites it for asset-URL resolution (a `/@fs/...`-prefixed
// public path), which breaks when the result is fed straight to
// `fileURLToPath`/`readFileSync` for a plain file read outside this
// package's own directory. Resolving via `node:path` off the single-argument
// `fileURLToPath(import.meta.url)` call sidesteps that rewrite entirely.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(HERE, '../../cost-engine/test/fixtures/demo-estate');

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf-8');
}

describe('AttributionWorkbench — 80-resource demo estate smoke test', () => {
  it('renders the golden 81.2% coverage figure over the real demo fixtures', async () => {
    const inventory = parseInventoryYaml(loadFixture('demo.inventory.yaml'));
    const spend = parseSpendYaml(loadFixture('demo.spend.yaml'));
    const attribution = parseAttributionYaml(loadFixture('demo.attribution.yaml'));
    if (!inventory.ok) throw new Error(`inventory fixture failed to parse: ${JSON.stringify(inventory.errors)}`);
    if (!spend.ok) throw new Error(`spend fixture failed to parse: ${JSON.stringify(spend.errors)}`);
    if (!attribution.ok) throw new Error(`attribution fixture failed to parse: ${JSON.stringify(attribution.errors)}`);

    const repository = createMemoryRepository({
      inventories: { 'demo.inventory.yaml': inventory.data },
      attributions: { 'demo.attribution.yaml': attribution.data },
      spends: { 'demo.spend.yaml': spend.data },
    });

    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <AttributionWorkbench inventoryRef="demo.inventory.yaml" attributionRef="demo.attribution.yaml" />
      </CostStudioProvider>,
    );

    expect(await screen.findByText('81.2%')).toBeInTheDocument();
    expect(screen.getByText('$2,474/mo unattributed')).toBeInTheDocument();
    expect(screen.getByText('Unattributed · 20')).toBeInTheDocument();
  });
});
