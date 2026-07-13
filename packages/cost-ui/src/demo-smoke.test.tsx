// Smoke test over the REAL 80-resource "fieldstate-azure" demo estate —
// cost-engine's own golden fixture, loaded from YAML on disk (not the
// compact hand-built test estate the other test files use) — proving the
// workbench renders correctly at the size and shape the design handoff was
// actually built against (81.2% coverage is cost-engine's own pinned oracle
// number; see its `golden.test.ts`).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CostRepositoryPort } from '@workspec/cost-schema';
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

function loadDemoRepository(): CostRepositoryPort {
  const inventory = parseInventoryYaml(loadFixture('demo.inventory.yaml'));
  const spend = parseSpendYaml(loadFixture('demo.spend.yaml'));
  const attribution = parseAttributionYaml(loadFixture('demo.attribution.yaml'));
  if (!inventory.ok) throw new Error(`inventory fixture failed to parse: ${JSON.stringify(inventory.errors)}`);
  if (!spend.ok) throw new Error(`spend fixture failed to parse: ${JSON.stringify(spend.errors)}`);
  if (!attribution.ok) throw new Error(`attribution fixture failed to parse: ${JSON.stringify(attribution.errors)}`);

  return createMemoryRepository({
    inventories: { 'demo.inventory.yaml': inventory.data },
    attributions: { 'demo.attribution.yaml': attribution.data },
    spends: { 'demo.spend.yaml': spend.data },
  });
}

describe('AttributionWorkbench — 80-resource demo estate smoke test', () => {
  it('renders the golden 81.2% coverage figure over the real demo fixtures', async () => {
    const repository = loadDemoRepository();

    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <AttributionWorkbench inventoryRef="demo.inventory.yaml" attributionRef="demo.attribution.yaml" />
      </CostStudioProvider>,
    );

    expect(await screen.findByText('81.2%')).toBeInTheDocument();
    expect(screen.getByText('$2,474/mo unattributed')).toBeInTheDocument();
    expect(screen.getByText('Unattributed · 20')).toBeInTheDocument();
  });

  it('renders the r4 "Shared AKS split" chip ratio-descending (60/40, not the on-disk alphabetical 40/60)', async () => {
    const repository = loadDemoRepository();

    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <AttributionWorkbench inventoryRef="demo.inventory.yaml" attributionRef="demo.attribution.yaml" />
      </CostStudioProvider>,
    );

    await screen.findByText('81.2%');
    // demo.attribution.yaml serializes this rule's split as `atrium: 0.4`
    // before `workspec: 0.6` (alphabetical, per cost-engine's
    // serializeSplitValue contract) — the rendered chip must still read
    // ratio-descending.
    expect(screen.getByText('product split 60/40')).toBeInTheDocument();
  });

  it('composer over the mixed rg-legacy-misc cluster: matches/spend/coverage-delta agree (the vm-old-jenkins override no longer inflates the count)', async () => {
    const repository = loadDemoRepository();

    render(
      <CostStudioProvider host={{ repository, capabilities: { editAttribution: true } }}>
        <AttributionWorkbench inventoryRef="demo.inventory.yaml" attributionRef="demo.attribution.yaml" />
      </CostStudioProvider>,
    );

    await screen.findByText('81.2%');
    fireEvent.click(screen.getByText('Fix coverage →'));

    // rg-legacy-misc has 13 resources; vm-old-jenkins is pinned to
    // product=shared via an override, so only the other 12 ($1,159) are
    // still unattributed — the same set the composer's projection counts.
    const cluster = await screen.findByText('rg-legacy-misc · 12 · $1,159');
    fireEvent.click(cluster);

    expect(await screen.findByText('resourceGroup ~ rg-legacy-misc')).toBeInTheDocument();
    expect(screen.getByText(/matches 12 · \$1,159\/mo/)).toBeInTheDocument();
    expect(screen.queryByText(/matches 13 ·/)).not.toBeInTheDocument();
    expect(screen.getByText('90.0%')).toBeInTheDocument();
  });
});
