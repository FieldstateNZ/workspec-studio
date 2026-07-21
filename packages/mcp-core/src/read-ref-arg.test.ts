import { describe, expect, it } from 'vitest';
import { InvalidRefError, readRefArg } from './read-ref-arg.js';

describe('readRefArg', () => {
  it('returns a well-shaped ref', () => {
    expect(readRefArg({ ref: 'a/b.decision.yaml' }, 'ref')).toBe('a/b.decision.yaml');
  });

  it('throws InvalidRefError for an ill-shaped ref (traversal)', () => {
    expect(() => readRefArg({ ref: '../outside.yaml' }, 'ref')).toThrow(InvalidRefError);
  });

  it('throws InvalidRefError for a backslash-traversal shape', () => {
    expect(() => readRefArg({ ref: String.raw`..\..\x.yaml` }, 'ref')).toThrow(InvalidRefError);
  });

  it('InvalidRefError names only the argument, not the offending value', () => {
    try {
      readRefArg({ ref: '/etc/passwd' }, 'ref');
      expect.unreachable('expected readRefArg to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRefError);
      expect((error as Error).message).toBe('argument "ref" is not a valid repo-relative path');
      expect((error as Error).message).not.toContain('/etc/passwd');
    }
  });

  it('throws a plain Error (not InvalidRefError) when the key is missing', () => {
    expect(() => readRefArg({}, 'ref')).toThrow('missing required argument "ref"');
  });
});
