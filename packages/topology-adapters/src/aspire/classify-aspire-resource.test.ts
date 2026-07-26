import { describe, expect, it } from 'vitest';
import { classifyAspireResource } from './classify-aspire-resource.js';

describe('classifyAspireResource', () => {
  it('skips parameter resources unconditionally', () => {
    expect(classifyAspireResource('parameter', 'ParameterResource')).toEqual({ outcome: 'skip' });
    // typeName is never consulted for a parameter, even one that looks database-shaped.
    expect(classifyAspireResource('parameter', 'PostgresParameterResource')).toEqual({
      outcome: 'skip',
    });
  });

  it.each([
    ['PostgresServerResource', 'PostgreSQL'],
    ['PostgresDatabaseResource', 'PostgreSQL'],
    ['MySqlServerResource', 'MySQL'],
    ['SqlServerServerResource', 'SQL Server'],
    ['MongoDatabaseResource', 'MongoDB'],
    ['OracleDatabaseResource', 'Oracle Database'],
  ])('classifies %s as a database (%s), provider aspire', (typeName, type) => {
    expect(classifyAspireResource('container', typeName)).toEqual({
      outcome: 'mapped',
      kind: 'database',
      type,
      provider: 'aspire',
    });
  });

  it.each([
    ['RedisResource', 'Redis'],
    ['ValkeyResource', 'Valkey'],
    ['GarnetResource', 'Garnet'],
  ])('classifies %s as a cache (%s), provider aspire', (typeName, type) => {
    expect(classifyAspireResource('container', typeName)).toEqual({
      outcome: 'mapped',
      kind: 'cache',
      type,
      provider: 'aspire',
    });
  });

  it.each(['RabbitMQServerResource', 'KafkaServerResource', 'NatsServerResource'])(
    'leaves non-Azure queue/broker-shaped %s unmapped (no ResourceKind exists yet)',
    (typeName) => {
      expect(classifyAspireResource('container', typeName)).toEqual({ outcome: 'unmapped' });
    },
  );

  it.each(['AzureServiceBusResource', 'AzureEventHubsResource'])(
    'leaves Azure messaging type %s unmapped via the azure-kind branch, not the (non-Azure) queue-prefix list',
    (typeName) => {
      // These are `kind: "azure"` in a real graph (their CLR namespace
      // contains "Azure") and are absent from BOTH
      // AZURE_TYPE_NAME_PREFIX_TO_CATALOG_KEY and
      // ASPIRE_QUEUE_TYPE_NAME_PREFIXES — a queue-prefix entry for them
      // would be unreachable dead code, since the `kind === 'azure'` branch
      // always resolves (or fails to resolve) first and returns before the
      // queue-prefix check is ever reached.
      expect(classifyAspireResource('azure', typeName)).toEqual({ outcome: 'unmapped' });
    },
  );

  it('classifies a curated azure typeName using the shared VENDOR_KIND_CATALOG entry, provider azure', () => {
    expect(classifyAspireResource('azure', 'AzureStorageResource')).toEqual({
      outcome: 'mapped',
      kind: 'storage',
      type: 'Azure Storage Account',
      provider: 'azure',
    });
    expect(classifyAspireResource('azure', 'AzureSearchResource')).toEqual({
      outcome: 'mapped',
      kind: 'search',
      type: 'Azure AI Search',
      provider: 'azure',
    });
  });

  it('leaves an unrecognized azure typeName unmapped rather than guessing', () => {
    expect(classifyAspireResource('azure', 'AzureKeyVaultResource')).toEqual({
      outcome: 'unmapped',
    });
  });

  describe('Azure SQL: database maps, bare server does not (BLOCKING review fix)', () => {
    it('maps AzureSqlDatabaseResource to the sqlDatabase catalog entry', () => {
      expect(classifyAspireResource('azure', 'AzureSqlDatabaseResource')).toEqual({
        outcome: 'mapped',
        kind: 'database',
        type: 'Azure SQL Database',
        provider: 'azure',
      });
    });

    it('leaves the bare AzureSqlServerResource (the logical server, not a database) unmapped', () => {
      expect(classifyAspireResource('azure', 'AzureSqlServerResource')).toEqual({
        outcome: 'unmapped',
      });
    });

    it('leaves a bare AzureSqlResource (no server/database qualifier) unmapped rather than guessing', () => {
      expect(classifyAspireResource('azure', 'AzureSqlResource')).toEqual({ outcome: 'unmapped' });
    });
  });

  describe('Azure Redis: enterprise/managed vs. cache, longest-prefix-wins (accepted non-blocking #3)', () => {
    it('maps AzureRedisResource to the standard redisCache catalog entry', () => {
      expect(classifyAspireResource('azure', 'AzureRedisResource')).toEqual({
        outcome: 'mapped',
        kind: 'cache',
        type: 'Azure Cache for Redis',
        provider: 'azure',
      });
    });

    it('maps AzureRedisCacheResource to redisCache too', () => {
      expect(classifyAspireResource('azure', 'AzureRedisCacheResource')).toEqual({
        outcome: 'mapped',
        kind: 'cache',
        type: 'Azure Cache for Redis',
        provider: 'azure',
      });
    });

    it('maps AzureManagedRedisResource to redisEnterprise, not the shorter azureredis prefix', () => {
      expect(classifyAspireResource('azure', 'AzureManagedRedisResource')).toEqual({
        outcome: 'mapped',
        kind: 'cache',
        type: 'Azure Managed Redis',
        provider: 'azure',
      });
    });

    it('maps AzureRedisEnterpriseResource to redisEnterprise, not redisCache (both prefixes match; longest must win)', () => {
      // "azurerediseneterpriseresource" (lowercased) starts with BOTH
      // "azureredis" (-> redisCache) and the more specific
      // "azureredisenterprise" (-> redisEnterprise). This is the exact case
      // that requires matchPrefix's longest-match rule rather than
      // first-declared-in-the-object-literal order.
      expect(classifyAspireResource('azure', 'AzureRedisEnterpriseResource')).toEqual({
        outcome: 'mapped',
        kind: 'cache',
        type: 'Azure Managed Redis',
        provider: 'azure',
      });
    });
  });

  it.each(['container', 'executable', 'project', 'unknown', 'some-future-kind'])(
    'falls back to compute for %s when not otherwise classified, type = raw typeName',
    (kind) => {
      expect(classifyAspireResource(kind, 'CustomWidgetResource')).toEqual({
        outcome: 'mapped',
        kind: 'compute',
        type: 'CustomWidgetResource',
        provider: 'aspire',
      });
    },
  );

  it('typeName prefix matching is case-insensitive', () => {
    expect(classifyAspireResource('container', 'POSTGRESSERVERRESOURCE')).toMatchObject({
      outcome: 'mapped',
      kind: 'database',
    });
  });
});
