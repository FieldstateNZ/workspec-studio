import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAspireGraph } from './graph-schema.js';

const fixturePath = (rel: string): string =>
  fileURLToPath(new URL(`../../test/fixtures/aspire/${rel}`, import.meta.url));

describe('parseAspireGraph', () => {
  it('parses the committed sample graph fixture', async () => {
    const text = await readFile(fixturePath('sample-graph.json'), 'utf8');
    const result = parseAspireGraph(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.apphost.name).toBe('Ledger AppHost');
      expect(result.data.resources).toHaveLength(7);
    }
  });

  it('rejects invalid JSON with a usage-error message', () => {
    const result = parseAspireGraph('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/invalid JSON/);
  });

  it('rejects a missing version field', () => {
    const result = parseAspireGraph(JSON.stringify({ apphost: { name: 'x' }, resources: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/unsupported graph version/);
  });

  it('rejects a wrong version with a clear message naming the found and expected versions', () => {
    const result = parseAspireGraph(
      JSON.stringify({ version: 'workspec-graph/v2', apphost: { name: 'x' }, resources: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('workspec-graph/v2');
      expect(result.message).toContain('workspec-graph/v1');
    }
  });

  it('rejects a schema violation (e.g. an unknown resource kind) distinctly from a version mismatch', () => {
    const result = parseAspireGraph(
      JSON.stringify({
        version: 'workspec-graph/v1',
        apphost: { name: 'x' },
        resources: [{ name: 'r', kind: 'not-a-real-kind', typeName: 'T' }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/invalid graph/);
  });

  it('accepts an endpoint with a null scheme (the producer Scheme is nullable, like port/targetPort)', () => {
    const result = parseAspireGraph(
      JSON.stringify({
        version: 'workspec-graph/v1',
        apphost: { name: 'x' },
        resources: [
          {
            name: 'r',
            kind: 'container',
            typeName: 'ContainerResource',
            endpoints: [{ name: 'tcp', scheme: null, port: 5000, targetPort: null }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.resources[0]?.endpoints[0]?.scheme).toBeNull();
  });

  it('ignores unknown extra fields (lenient boundary contract)', () => {
    const result = parseAspireGraph(
      JSON.stringify({
        version: 'workspec-graph/v1',
        apphost: { name: 'x', futureField: 'ignored' },
        resources: [],
        futureTopLevelField: 'ignored',
      }),
    );
    expect(result.ok).toBe(true);
  });
});
