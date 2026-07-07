import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Catalog, Decision } from '@workspec/decision-schema';
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { buildAdrModel, formatMoney, renderAdrMarkdown } from './adr.js';

const repoUrl = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const read = (rel: string): string => readFileSync(repoUrl(rel), 'utf8');

let decision: Decision;
let catalog: Catalog;

beforeAll(() => {
  const decisionRes = parseDecisionYaml(
    read('examples/hosting-platform/hosting-platform.decision.yaml'),
  );
  const catalogRes = parseCatalogYaml(read('examples/hosting-platform/platform.catalog.yaml'));
  if (!decisionRes.ok) throw new Error('decision fixture failed to parse');
  if (!catalogRes.ok) throw new Error('catalog fixture failed to parse');
  decision = decisionRes.data;
  catalog = catalogRes.data;
});

describe('formatMoney (deterministic, P8)', () => {
  it('groups thousands and drops a whole fraction', () => {
    expect(formatMoney(16104)).toBe('$16,104');
    expect(formatMoney(54336.576)).toBe('$54,336.58');
    expect(formatMoney(714.6)).toBe('$714.60');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(1000000)).toBe('$1,000,000');
  });
});

describe('buildAdrModel (hosting-platform, exploring)', () => {
  it('proposes the recommended option (aks) with Proposed status', () => {
    const model = buildAdrModel(decision, catalog);
    expect(model.status).toBe('Proposed');
    expect(model.decision.decided).toBe(false);
    expect(model.decision.optionId).toBe('aks');
    expect(model.decision.optionName).toBe('AKS');
  });

  it('carries the S2 golden annual costs on the considered options', () => {
    const model = buildAdrModel(decision, catalog);
    const byId = Object.fromEntries(model.consideredOptions.map((o) => [o.id, o]));
    expect(byId['aks']!.annual).toBe(54336.576);
    expect(byId['appsvc']!.annual).toBe(16104);
    expect(byId['ase']!.annual).toBe(53700);
    expect(byId['aca']!.annual).toBe(14160);
    expect(byId['aca']!.complete).toBe(false);
  });

  it('derives consequences from the winner criteria + a premium/headroom line', () => {
    const model = buildAdrModel(decision, catalog);
    // aks: scaleCeiling 5, isolation 4, lockIn 4 => strengths; opsBurden 2, migration 2 => weaknesses.
    const strengths = model.consequences.filter((c) => c.kind === 'strength');
    const weaknesses = model.consequences.filter((c) => c.kind === 'weakness');
    expect(strengths.length).toBe(3);
    // 2 criteria weaknesses + 1 cost premium line.
    expect(weaknesses.length).toBe(3);
    const premium = weaknesses.at(-1)!;
    expect(premium.text).toContain(formatMoney(54336.576 - 16104)); // $38,232.58
    expect(premium.text).toContain(formatMoney(950 * 12)); // $11,400
  });

  it('uses the authored rationale once a decision is decided', () => {
    const decided: Decision = {
      ...decision,
      metadata: { ...decision.metadata, status: 'decided' },
      spec: {
        ...decision.spec,
        outcome: { option: 'appsvc', rationale: 'We accept weaker scale for the lowest run-rate.' },
      },
    };
    const model = buildAdrModel(decided, catalog);
    expect(model.status).toBe('Accepted');
    expect(model.decision.decided).toBe(true);
    expect(model.decision.optionId).toBe('appsvc');
    expect(model.decision.rationale).toBe('We accept weaker scale for the lowest run-rate.');
  });
});

describe('renderAdrMarkdown (hosting-platform)', () => {
  it('produces a stable Markdown ADR with full golden costs', () => {
    const markdown = renderAdrMarkdown(buildAdrModel(decision, catalog));
    expect(markdown).toContain('# Hosting platform for the data and delivery services');
    expect(markdown).toContain('**Status:** Proposed');
    expect(markdown).toContain('$54,336.58');
    expect(markdown).toContain('$16,104');
    expect(markdown).toMatchSnapshot();
  });
});
