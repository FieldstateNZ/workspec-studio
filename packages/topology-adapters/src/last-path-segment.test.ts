import { describe, expect, it } from 'vitest';
import { lastPathSegment } from './last-path-segment.js';

describe('lastPathSegment', () => {
  it('returns the last non-empty segment of a slash-separated path', () => {
    expect(lastPathSegment('/subscriptions/x/resourceGroups/rg-app/subnets/snet-workload')).toBe(
      'snet-workload',
    );
  });

  it('ignores a trailing slash', () => {
    expect(lastPathSegment('a/b/c/')).toBe('c');
  });

  it('returns undefined for an empty or all-slash input', () => {
    expect(lastPathSegment('')).toBeUndefined();
    expect(lastPathSegment('///')).toBeUndefined();
  });
});
