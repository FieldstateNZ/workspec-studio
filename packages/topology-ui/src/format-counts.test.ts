import { describe, expect, it } from 'vitest';
import { formatLensCounts } from './format-counts.js';

describe('formatLensCounts', () => {
  it('formats a network lens count with vnet and subnet segments', () => {
    expect(formatLensCounts({ resources: 11, containersByKind: { vnet: 1, subnet: 1 } })).toBe(
      '11 resources · 1 VNet · 1 subnet',
    );
  });

  it('formats a resource-group lens count with a resource groups segment', () => {
    expect(
      formatLensCounts({ resources: 10, containersByKind: { 'resource-group': 3 } }),
    ).toBe('10 resources · 3 resource groups');
  });

  it('pluralizes VNet/subnet correctly at counts above one', () => {
    expect(formatLensCounts({ resources: 20, containersByKind: { vnet: 2, subnet: 4 } })).toBe(
      '20 resources · 2 VNets · 4 subnets',
    );
  });

  it('singularizes the resource count itself', () => {
    expect(formatLensCounts({ resources: 1, containersByKind: {} })).toBe('1 resource');
  });

  it('omits a grouping segment entirely when its count is zero', () => {
    expect(formatLensCounts({ resources: 4, containersByKind: { vnet: 0 } })).toBe('4 resources');
  });
});
