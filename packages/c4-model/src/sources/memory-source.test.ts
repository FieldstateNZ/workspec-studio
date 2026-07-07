import { describe, expect, it } from 'vitest';
import { createMemorySource } from './memory-source.js';

describe('createMemorySource', () => {
  it('lists only the immediate, non-recursive entries of a directory', async () => {
    const source = createMemorySource({
      '.workspec/diagrams/container.yaml': 'a',
      '.workspec/diagrams/system-context.yaml': 'b',
      '.workspec/diagrams/.layout/container.yaml': 'c',
    });

    const entries = await source.listFiles('.workspec/diagrams');
    expect([...entries].sort()).toEqual(['.workspec/diagrams/container.yaml', '.workspec/diagrams/system-context.yaml']);
  });

  it('resolves an empty list for a directory with no entries', async () => {
    const source = createMemorySource({});
    expect(await source.listFiles('.workspec/actors')).toEqual([]);
  });

  it('reads seeded file content', async () => {
    const source = createMemorySource({ '.workspec/spec.yaml': 'type: style\n' });
    expect(await source.readFile('.workspec/spec.yaml')).toBe('type: style\n');
  });

  it('rejects reading a file that was never seeded', async () => {
    const source = createMemorySource({});
    await expect(source.readFile('.workspec/spec.yaml')).rejects.toThrow();
  });

  it('exists() reflects writes made after construction', async () => {
    const source = createMemorySource({});
    expect(await source.exists('.workspec/spec.yaml')).toBe(false);
    await source.writeFile('.workspec/spec.yaml', 'type: style\n');
    expect(await source.exists('.workspec/spec.yaml')).toBe(true);
    expect(await source.readFile('.workspec/spec.yaml')).toBe('type: style\n');
  });
});
