import { win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RefEscapesRootError, resolveWithinRoot } from './path-containment.js';

// The CLI/host process may actually run on Windows, so the default
// `pathImpl` (host `node:path`) becomes `path.win32` there — the drive-letter
// and UNC cases below simulate exactly that by passing `path.win32`
// explicitly, since this suite always runs on POSIX CI.
//
// Mirrors `@workspec/cost-studio`'s (and `@workspec/decision-studio`'s)
// `path-containment.test.ts`.

describe('resolveWithinRoot — Windows semantics (path.win32)', () => {
  const root = String.raw`C:\Users\dev\workspace`;

  it('rejects a drive-letter ref that points at another drive location', () => {
    expect(() => resolveWithinRoot(root, String.raw`C:\evil\x.txt`, win32)).toThrow(
      RefEscapesRootError,
    );
  });

  it('rejects a UNC ref', () => {
    expect(() => resolveWithinRoot(root, String.raw`\\srv\share\x.txt`, win32)).toThrow(
      RefEscapesRootError,
    );
  });

  it('rejects backslash-delimited `..` traversal that climbs above root', () => {
    expect(() => resolveWithinRoot(root, String.raw`sub\..\..\evil.txt`, win32)).toThrow(
      RefEscapesRootError,
    );
  });

  it('rejects a bare `..`', () => {
    expect(() => resolveWithinRoot(root, '..', win32)).toThrow(RefEscapesRootError);
  });

  it('resolves and accepts a normal in-root relative ref (forward slashes)', () => {
    expect(resolveWithinRoot(root, '.workspec/diagrams/system-context.yaml', win32)).toBe(
      String.raw`C:\Users\dev\workspace\.workspec\diagrams\system-context.yaml`,
    );
  });

  it('resolves and accepts a normal in-root relative ref (backslashes)', () => {
    expect(resolveWithinRoot(root, String.raw`.workspec\diagrams\system-context.yaml`, win32)).toBe(
      String.raw`C:\Users\dev\workspace\.workspec\diagrams\system-context.yaml`,
    );
  });
});

describe('resolveWithinRoot — POSIX semantics (default pathImpl)', () => {
  const root = '/repo/root';

  it('rejects a POSIX absolute ref', () => {
    expect(() => resolveWithinRoot(root, '/etc/passwd')).toThrow(RefEscapesRootError);
  });

  it('rejects `..` traversal that escapes root', () => {
    expect(() => resolveWithinRoot(root, '../escape.yaml')).toThrow(RefEscapesRootError);
  });

  it('resolves and accepts a normal in-root relative ref (no regression on the happy path)', () => {
    expect(resolveWithinRoot(root, '.workspec/diagrams/system-context.yaml')).toBe(
      '/repo/root/.workspec/diagrams/system-context.yaml',
    );
  });

  it('the escaped-ref error carries the original ref for diagnostics', () => {
    try {
      resolveWithinRoot(root, '../escape.yaml');
      expect.unreachable('expected resolveWithinRoot to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RefEscapesRootError);
      expect((error as RefEscapesRootError).ref).toBe('../escape.yaml');
    }
  });
});
