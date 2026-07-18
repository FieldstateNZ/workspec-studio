import { describe, expect, it } from 'vitest';
import { slugFromPath } from '@workspec/schema-core';
import { typeDirectoryFor } from './type-directories.js';

/**
 * The slug is the filename stem regardless of directory depth — proving
 * schema-core's `slugFromPath` recovers identity for req-schema's nested
 * `requirements/user` and `requirements/system` directories, not just the
 * flat `features` one. This is the identity contract for `SystemRequirement`:
 * slug = scenario name = path stem.
 */
describe('slugFromPath over req-schema type directories', () => {
  it('recovers the slug from a nested system-requirement path', () => {
    const path = `${typeDirectoryFor('SystemRequirement')}/inline-create-persists.yaml`;
    expect(path).toBe('.workspec/requirements/system/inline-create-persists.yaml');
    expect(slugFromPath(path)).toBe('inline-create-persists');
  });

  it('recovers the slug from a nested user-requirement path', () => {
    expect(slugFromPath('.workspec/requirements/user/authoring-flow.yaml')).toBe('authoring-flow');
  });

  it('recovers the slug from a flat feature path', () => {
    expect(slugFromPath('.workspec/features/element-authoring.yaml')).toBe('element-authoring');
  });
});
