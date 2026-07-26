import { describe, expect, it } from 'vitest';
import type { AspireResourceInput } from './aspire-resource-input.js';
import { extractAspireConfig } from './extract-aspire-config.js';

function resource(overrides: Partial<AspireResourceInput> = {}): AspireResourceInput {
  return {
    name: 'r',
    kind: 'container',
    typeName: 'Foo',
    endpoints: [],
    references: [],
    ...overrides,
  };
}

describe('extractAspireConfig', () => {
  it('returns undefined when nothing curated is present', () => {
    expect(extractAspireConfig(resource())).toBeUndefined();
  });

  it('curates image', () => {
    expect(extractAspireConfig(resource({ image: 'docker.io/library/redis:7' }))).toEqual({
      image: 'docker.io/library/redis:7',
    });
  });

  it('curates command and workingDirectory', () => {
    expect(
      extractAspireConfig(resource({ command: 'pnpm', workingDirectory: '/app/worker' })),
    ).toEqual({ command: 'pnpm', workingDirectory: '/app/worker' });
  });

  it('curates endpoints verbatim, omitting unset optional endpoint fields', () => {
    expect(
      extractAspireConfig(
        resource({
          endpoints: [
            { name: 'http', scheme: 'http', port: 8080, targetPort: 8080, external: true },
            { name: 'internal-only' },
          ],
        }),
      ),
    ).toEqual({
      endpoints: [
        { name: 'http', scheme: 'http', port: 8080, targetPort: 8080, external: true },
        { name: 'internal-only' },
      ],
    });
  });

  it('combines every curated field present', () => {
    expect(
      extractAspireConfig(
        resource({
          image: 'docker.io/library/postgres:17',
          endpoints: [{ name: 'tcp', port: 5432 }],
        }),
      ),
    ).toEqual({
      image: 'docker.io/library/postgres:17',
      endpoints: [{ name: 'tcp', port: 5432 }],
    });
  });
});
