import { describe, expect, it } from 'vitest';
import { buildDerivedResource } from './build-derived-resource.js';
import { disambiguateDuplicateSlugs } from './disambiguate-duplicate-slugs.js';

function cache(slug: string, resourceGroup: string, from: string) {
  return buildDerivedResource({
    slug,
    name: 'cache',
    kind: 'cache',
    type: 'Azure Cache for Redis',
    provider: 'azure',
    resourceGroup,
    from,
  });
}

describe('disambiguateDuplicateSlugs', () => {
  it('passes unique slugs through untouched and emits no diagnostics', () => {
    const resources = [cache('cache-one', 'rg-one', 'a'), cache('cache-two', 'rg-two', 'b')];
    const result = disambiguateDuplicateSlugs(resources);
    expect(result.resources.map((r) => r.metadata.slug)).toEqual(['cache-one', 'cache-two']);
    expect(result.diagnostics).toEqual([]);
  });

  it('disambiguates a name shared across two resource groups by appending resourceGroup, losslessly', () => {
    const resources = [
      cache('cache', 'rg-one', 'azurerm_redis_cache.a'),
      cache('cache', 'rg-two', 'azurerm_redis_cache.b'),
    ];
    const result = disambiguateDuplicateSlugs(resources);

    const slugs = result.resources.map((r) => r.metadata.slug);
    expect(slugs).toEqual(['cache-rg-one', 'cache-rg-two']);
    expect(new Set(slugs).size).toBe(2); // no resource lost to a silent overwrite
    expect(result.resources).toHaveLength(2);
  });

  it('emits exactly one diagnostic per colliding original slug, not one per resource', () => {
    const resources = [
      cache('cache', 'rg-one', 'a'),
      cache('cache', 'rg-two', 'b'),
      cache('cache', 'rg-three', 'c'),
    ];
    const result = disambiguateDuplicateSlugs(resources);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'warning', source: 'cache' });
    expect(result.diagnostics[0]?.message).toContain('3 resources');
  });

  it('falls back to a numeric suffix when the resourceGroup discriminator itself still collides', () => {
    // Same name AND same resource group: a true duplicate declaration.
    const resources = [cache('cache', 'rg-one', 'a'), cache('cache', 'rg-one', 'b')];
    const result = disambiguateDuplicateSlugs(resources);

    const slugs = result.resources.map((r) => r.metadata.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs).toEqual(['cache-rg-one', 'cache-rg-one-2']);
  });

  it('does not disturb metadata.slug identity beyond the slug field itself', () => {
    const resources = [cache('cache', 'rg-one', 'a'), cache('cache', 'rg-two', 'b')];
    const [first] = disambiguateDuplicateSlugs(resources).resources;
    expect(first?.spec.resourceGroup).toBe('rg-one');
    expect(first?.spec.source).toEqual({ kind: 'derived', from: 'a' });
  });
});
