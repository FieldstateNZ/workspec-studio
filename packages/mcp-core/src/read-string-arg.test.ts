import { describe, expect, it } from 'vitest';
import { readStringArg } from './read-string-arg.js';

describe('readStringArg', () => {
  it('returns the string value for a present key', () => {
    expect(readStringArg({ ref: 'x.yaml' }, 'ref')).toBe('x.yaml');
  });

  it('throws when args is not an object', () => {
    expect(() => readStringArg('nope', 'ref')).toThrow('missing required argument "ref"');
    expect(() => readStringArg(null, 'ref')).toThrow('missing required argument "ref"');
    expect(() => readStringArg(undefined, 'ref')).toThrow('missing required argument "ref"');
  });

  it('throws when the key is missing', () => {
    expect(() => readStringArg({}, 'ref')).toThrow('missing required argument "ref"');
  });

  it('throws when the value is not a string', () => {
    expect(() => readStringArg({ ref: 42 }, 'ref')).toThrow('argument "ref" must be a string');
  });
});
