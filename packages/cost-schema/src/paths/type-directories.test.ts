import { describe, expect, it } from 'vitest';
import { ARTIFACT_KINDS } from './artifact-kind.js';
import { TYPE_DIRECTORIES, typeDirectoryFor } from './type-directories.js';

describe('TYPE_DIRECTORIES', () => {
  it('maps each kind to its .workspec directory', () => {
    expect(typeDirectoryFor('Inventory')).toBe('.workspec/inventories');
    expect(typeDirectoryFor('Spend')).toBe('.workspec/spends');
    expect(typeDirectoryFor('Attribution')).toBe('.workspec/attributions');
    expect(typeDirectoryFor('TagPlan')).toBe('.workspec/tagplans');
  });

  it('agrees with the raw TYPE_DIRECTORIES map', () => {
    expect(typeDirectoryFor('Attribution')).toBe(`.workspec/${TYPE_DIRECTORIES.Attribution}`);
  });

  it('covers exactly the four kinds cost-schema owns', () => {
    expect(Object.keys(TYPE_DIRECTORIES).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });
});
