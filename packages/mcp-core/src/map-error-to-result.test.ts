import { describe, expect, it, vi } from 'vitest';
import { mapErrorToResult } from './map-error-to-result.js';
import { InvalidRefError } from './read-ref-arg.js';
import { InvalidSlugError } from './read-slug-arg.js';

describe('mapErrorToResult', () => {
  it('maps InvalidRefError to a client-safe message, before any classify callback runs', () => {
    const classify = vi.fn();
    const result = mapErrorToResult(new InvalidRefError('ref'), { logPrefix: 'test mcp', classify });
    expect(result.isError).toBe(true);
    expect(classify).not.toHaveBeenCalled();
  });

  it('maps InvalidSlugError to a client-safe message, before any classify callback runs', () => {
    const classify = vi.fn();
    const result = mapErrorToResult(new InvalidSlugError('env'), { logPrefix: 'test mcp', classify });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'argument "env" is not a valid slug' });
    expect(classify).not.toHaveBeenCalled();
  });

  it('uses the classify callback result when it classifies the error', () => {
    class DomainError extends Error {}
    const result = mapErrorToResult(new DomainError('boom'), {
      logPrefix: 'test mcp',
      classify: (error) =>
        error instanceof DomainError
          ? { content: [{ type: 'text', text: 'domain-specific' }], isError: true }
          : undefined,
    });
    expect(result.content[0]).toEqual({ type: 'text', text: 'domain-specific' });
  });

  it('falls through to ENOENT handling when classify returns undefined', () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const result = mapErrorToResult(err, { logPrefix: 'test mcp', classify: () => undefined });
    expect(result.content[0]).toEqual({ type: 'text', text: 'not found' });
  });

  it('scrubs an unclassified error to a generic message and logs the real error server-side', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const err = new Error('/absolute/served/root leaked here');
      const result = mapErrorToResult(err, { logPrefix: 'cost mcp', ref: 'x.yaml' });
      expect(result.content[0]).toEqual({ type: 'text', text: 'internal error' });
      expect(JSON.stringify(result)).not.toContain('/absolute/served/root');
      expect(errorSpy).toHaveBeenCalledWith('[cost mcp] unhandled error, ref:', 'x.yaml', err);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs without a ref when none was supplied', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const err = new Error('boom');
      mapErrorToResult(err, { logPrefix: 'c4 mcp' });
      expect(errorSpy).toHaveBeenCalledWith('[c4 mcp] unhandled error:', err);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
