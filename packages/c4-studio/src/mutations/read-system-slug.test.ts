import { describe, expect, it } from 'vitest';
import { createMemorySource } from '@workspec/c4-model';
import { readSystemSlug } from './read-system-slug.js';

describe('readSystemSlug', () => {
  it('reads the slug from the system directory', async () => {
    const source = createMemorySource({
      '.workspec/system/main-system.yaml': 'title: Fieldstate Ledger\n',
    });
    expect(await readSystemSlug(source)).toBe('main-system');
  });

  it('is null for a tree with no system — the alias then stands for nothing', async () => {
    const source = createMemorySource({ '.workspec/actors/architect.yaml': 'title: A\n' });
    expect(await readSystemSlug(source)).toBeNull();
  });

  it('agrees with the loader on an ambiguous tree: first slug in sort order', async () => {
    const source = createMemorySource({
      '.workspec/system/zeta.yaml': 'title: Z\n',
      '.workspec/system/alpha.yaml': 'title: A\n',
    });
    expect(await readSystemSlug(source)).toBe('alpha');
  });
});
