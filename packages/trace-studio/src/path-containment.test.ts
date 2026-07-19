import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { RefEscapesRootError, resolveWithinRoot } from './path-containment.js';

const ROOT = '/srv/tree';

describe('resolveWithinRoot', () => {
  it('resolves a plain relative ref inside the root', () => {
    expect(resolveWithinRoot(ROOT, '.workspec/features/a.yaml', nodePath.posix)).toBe(
      '/srv/tree/.workspec/features/a.yaml',
    );
  });

  it('rejects a POSIX absolute ref', () => {
    expect(() => resolveWithinRoot(ROOT, '/etc/passwd', nodePath.posix)).toThrow(
      RefEscapesRootError,
    );
  });

  it('rejects a .. traversal that climbs above root', () => {
    expect(() => resolveWithinRoot(ROOT, '../../etc/passwd', nodePath.posix)).toThrow(
      RefEscapesRootError,
    );
  });

  it('allows a .. that stays within root', () => {
    expect(resolveWithinRoot(ROOT, 'a/../b.yaml', nodePath.posix)).toBe('/srv/tree/b.yaml');
  });

  it('rejects a Windows drive-letter ref when run with win32 semantics', () => {
    expect(() => resolveWithinRoot('C:\\tree', 'D:\\evil', nodePath.win32)).toThrow(
      RefEscapesRootError,
    );
  });
});
