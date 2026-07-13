import { describe, expect, it } from 'vitest';
import { classifyByTypeName, classifyResource } from './classify.js';
import type { AspireResource } from './graph-schema.js';

function resource(overrides: Partial<AspireResource>): AspireResource {
  return {
    name: 'r',
    kind: 'container',
    typeName: 'SomeResource',
    image: null,
    command: null,
    workingDirectory: null,
    endpoints: [],
    parent: null,
    references: [],
    properties: {},
    ...overrides,
  };
}

describe('classifyByTypeName', () => {
  it.each([
    ['PostgresServerResource', 'database'],
    ['PostgresDatabaseResource', 'database'],
    ['SqlServerServerResource', 'database'],
    ['MySqlDatabaseResource', 'database'],
    ['MongoDBServerResource', 'database'],
    ['RedisResource', 'database'],
    ['OracleDatabaseResource', 'database'],
    ['ValkeyResource', 'database'],
    ['GarnetResource', 'database'],
    ['RabbitMQServerResource', 'queue'],
    ['KafkaResource', 'queue'],
    ['AzureServiceBusResource', 'queue'],
    ['NatsResource', 'queue'],
    ['AzureEventHubsResource', 'queue'],
  ] as const)('classifies typeName %s as %s', (typeName, expected) => {
    expect(classifyByTypeName(typeName)).toBe(expected);
  });

  it('returns null for a typeName matching neither list', () => {
    expect(classifyByTypeName('ProjectResource')).toBeNull();
    expect(classifyByTypeName('AzureStorageResource')).toBeNull();
  });
});

describe('classifyResource', () => {
  it('always skips kind: parameter, regardless of typeName', () => {
    expect(classifyResource(resource({ kind: 'parameter', typeName: 'PostgresServerResource' }))).toBe(
      'skip',
    );
  });

  it('typeName classification wins over kind for container/executable/project/azure/unknown', () => {
    expect(classifyResource(resource({ kind: 'container', typeName: 'PostgresServerResource' }))).toBe(
      'database',
    );
    expect(classifyResource(resource({ kind: 'azure', typeName: 'AzureServiceBusResource' }))).toBe(
      'queue',
    );
  });

  it('maps container/executable/project (not otherwise classified) to container', () => {
    expect(classifyResource(resource({ kind: 'container', typeName: 'ExecutableResource' }))).toBe(
      'container',
    );
    expect(classifyResource(resource({ kind: 'executable', typeName: 'ExecutableResource' }))).toBe(
      'container',
    );
    expect(classifyResource(resource({ kind: 'project', typeName: 'ProjectResource' }))).toBe(
      'container',
    );
  });

  it('maps kind: azure (not otherwise classified) to external-system', () => {
    expect(classifyResource(resource({ kind: 'azure', typeName: 'AzureStorageResource' }))).toBe(
      'external-system',
    );
  });

  it('falls back to container for kind: unknown (not otherwise classified)', () => {
    expect(classifyResource(resource({ kind: 'unknown', typeName: 'SomeWeirdResource' }))).toBe(
      'container',
    );
  });
});
