import { describe, expect, it } from 'vitest';
import { ARTIFACT_KINDS } from './artifact-kind.js';
import { TYPE_DIRECTORIES, typeDirectoryFor } from './type-directories.js';

describe('TYPE_DIRECTORIES', () => {
  it('maps each kind to its .workspec directory', () => {
    expect(typeDirectoryFor('Topology')).toBe('.workspec/topologies');
    expect(typeDirectoryFor('Resource')).toBe('.workspec/resources');
    expect(typeDirectoryFor('Environment')).toBe('.workspec/environments');
  });

  it('agrees with the raw TYPE_DIRECTORIES map', () => {
    expect(typeDirectoryFor('Resource')).toBe(`.workspec/${TYPE_DIRECTORIES.Resource}`);
  });

  it('covers exactly the three kinds topology-schema owns', () => {
    expect(Object.keys(TYPE_DIRECTORIES).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });
});
