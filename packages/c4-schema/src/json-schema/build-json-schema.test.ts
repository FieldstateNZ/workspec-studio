import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { buildJsonSchema } from './build-json-schema.js';

describe('buildJsonSchema', () => {
  it('stamps $schema, $id, and title on the generated document', () => {
    const schema = z.object({ a: z.string() }).strict();
    const result = buildJsonSchema(
      schema,
      'https://example.com/x.schema.json',
      'Example',
    ) as Record<string, unknown>;

    expect(result.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(result.$id).toBe('https://example.com/x.schema.json');
    expect(result.title).toBe('Example');
    expect(result.type).toBe('object');
  });

  it('is deterministic across repeated calls (required for the drift test)', () => {
    const schema = z.object({ b: z.number(), a: z.string() }).strict();
    const first = buildJsonSchema(schema, 'https://example.com/x.schema.json', 'Example');
    const second = buildJsonSchema(schema, 'https://example.com/x.schema.json', 'Example');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
