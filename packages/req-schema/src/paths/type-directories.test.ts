import { describe, expect, it } from 'vitest';
import { ARTIFACT_KINDS } from './artifact-kind.js';
import { TYPE_DIRECTORIES, typeDirectoryFor } from './type-directories.js';

describe('TYPE_DIRECTORIES', () => {
  it('maps each kind to its .workspec directory', () => {
    expect(typeDirectoryFor('Feature')).toBe('.workspec/features');
    expect(typeDirectoryFor('UserRequirement')).toBe('.workspec/requirements/user');
    expect(typeDirectoryFor('SystemRequirement')).toBe('.workspec/requirements/system');
  });

  it('agrees with the raw TYPE_DIRECTORIES map', () => {
    expect(typeDirectoryFor('SystemRequirement')).toBe(
      `.workspec/${TYPE_DIRECTORIES.SystemRequirement}`,
    );
  });

  it('covers exactly the three kinds req-schema owns', () => {
    expect(Object.keys(TYPE_DIRECTORIES).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });
});
