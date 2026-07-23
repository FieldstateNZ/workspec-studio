import { describe, expect, it } from 'vitest';
import { isSafeRelativeRef } from './ref-shape.js';

describe('isSafeRelativeRef', () => {
  it('accepts a plain repo-relative POSIX ref', () => {
    expect(isSafeRelativeRef('examples/hosting-platform/platform.catalog.yaml')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isSafeRelativeRef('')).toBe(false);
  });

  it('rejects a POSIX-absolute path', () => {
    expect(isSafeRelativeRef('/etc/passwd')).toBe(false);
  });

  it('rejects any `..` traversal', () => {
    expect(isSafeRelativeRef('../outside.yaml')).toBe(false);
    expect(isSafeRelativeRef('a/../../b.yaml')).toBe(false);
  });

  it('rejects a NUL byte', () => {
    expect(isSafeRelativeRef('a\0b.yaml')).toBe(false);
  });

  it('rejects a backslash (including a backslash-traversal shape)', () => {
    expect(isSafeRelativeRef(String.raw`..\..\x.yaml`)).toBe(false);
    expect(isSafeRelativeRef(String.raw`a\b.yaml`)).toBe(false);
  });

  it('rejects a Windows drive-letter prefix', () => {
    expect(isSafeRelativeRef('C:/evil.yaml')).toBe(false);
    expect(isSafeRelativeRef('C:evil.yaml')).toBe(false);
  });
});
