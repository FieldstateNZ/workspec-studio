import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { buildJsonSchema } from './build-json-schema.js';

describe('buildJsonSchema', () => {
  it('stamps $schema, $id, and title, and sorts keys', () => {
    const schema = z.object({ b: z.number(), a: z.string() }).strict();
    const result = buildJsonSchema(schema, 'https://example.com/x.schema.json', 'Example') as Record<
      string,
      unknown
    >;
    expect(result.$id).toBe('https://example.com/x.schema.json');
    expect(result.title).toBe('Example');
    expect(result.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(Object.keys(result)).toEqual([...Object.keys(result)].sort());
  });
});
