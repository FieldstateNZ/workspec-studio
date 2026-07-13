// Generate the committed demo-estate fixtures from the single source of
// truth (`src/demo-estate.fixture.ts`).
//
//   pnpm --filter @workspec/cost-engine gen:fixtures
//
// Writes `test/fixtures/demo-estate/demo.{inventory,spend,attribution}.yaml`.
// `src/golden.test.ts` rebuilds the same artifacts at test time and
// asserts byte-equality with what's committed here, so CI fails if these
// files drift from `demo-estate.fixture.ts`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  serializeAttributionYaml,
  serializeInventoryYaml,
  serializeSpendYaml,
} from '@workspec/cost-schema';
import {
  buildDemoAttribution,
  buildDemoInventory,
  buildDemoSpend,
} from '../src/demo-estate.fixture.js';

// scripts/ → cost-engine/ → test/fixtures/demo-estate/
const fixtureUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/demo-estate/${file}`, import.meta.url));

const files: [string, string][] = [
  ['demo.inventory.yaml', serializeInventoryYaml(buildDemoInventory())],
  ['demo.spend.yaml', serializeSpendYaml(buildDemoSpend())],
  ['demo.attribution.yaml', serializeAttributionYaml(buildDemoAttribution())],
];

for (const [file, text] of files) {
  const target = fixtureUrl(file);
  writeFileSync(target, text, 'utf8');
  console.log(`wrote ${target}`);
}
