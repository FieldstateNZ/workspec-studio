import { describe, expect, it } from 'vitest';
import { createMemorySource } from './memory-source.js';

describe('createMemorySource', () => {
  it('lists only the immediate, non-recursive entries of a directory', async () => {
    const source = createMemorySource({
      '.workspec/topologies/web-app.yaml': 'a',
      '.workspec/topologies/other.yaml': 'b',
      '.workspec/topologies/.layout/web-app.yaml': 'c',
    });

    const entries = await source.listFiles('.workspec/topologies');
    expect([...entries].sort()).toEqual([
      '.workspec/topologies/other.yaml',
      '.workspec/topologies/web-app.yaml',
    ]);
  });

  it('resolves an empty list for a directory with no entries', async () => {
    const source = createMemorySource({});
    expect(await source.listFiles('.workspec/resources')).toEqual([]);
  });

  it('reads seeded file content', async () => {
    const source = createMemorySource({ '.workspec/topologies/web-app.yaml': 'title: Web App\n' });
    expect(await source.readFile('.workspec/topologies/web-app.yaml')).toBe('title: Web App\n');
  });

  it('rejects reading a file that was never seeded', async () => {
    const source = createMemorySource({});
    await expect(source.readFile('.workspec/topologies/web-app.yaml')).rejects.toThrow();
  });

  it('exists() reflects writes made after construction', async () => {
    const source = createMemorySource({});
    expect(await source.exists('.workspec/topologies/web-app.yaml')).toBe(false);
    await source.writeFile('.workspec/topologies/web-app.yaml', 'title: Web App\n');
    expect(await source.exists('.workspec/topologies/web-app.yaml')).toBe(true);
    expect(await source.readFile('.workspec/topologies/web-app.yaml')).toBe('title: Web App\n');
  });
});
