import { describe, expect, it } from 'vitest';
import { ARTIFACT_KINDS } from './artifact-kind.js';
import { TYPE_DIRECTORIES, typeDirectoryFor } from './type-directories.js';

describe('TYPE_DIRECTORIES', () => {
  it('maps each kind to its .workspec directory', () => {
    expect(typeDirectoryFor('Decision')).toBe('.workspec/decisions');
    expect(typeDirectoryFor('Catalog')).toBe('.workspec/catalogs');
  });

  it('agrees with the raw TYPE_DIRECTORIES map', () => {
    expect(typeDirectoryFor('Catalog')).toBe(`.workspec/${TYPE_DIRECTORIES.Catalog}`);
  });

  it('covers exactly the two kinds decision-schema owns', () => {
    expect(Object.keys(TYPE_DIRECTORIES).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });
});
