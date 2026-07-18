import { describe, expect, it } from 'vitest';
import { TYPE_DIRECTORIES, typeDirectoryFor } from './type-directories.js';

describe('typeDirectoryFor', () => {
  it('maps Actor to .workspec/actors', () => {
    expect(typeDirectoryFor('Actor')).toBe('.workspec/actors');
  });

  it('agrees with the raw TYPE_DIRECTORIES map', () => {
    expect(typeDirectoryFor('Actor')).toBe(`.workspec/${TYPE_DIRECTORIES.Actor}`);
  });
});
