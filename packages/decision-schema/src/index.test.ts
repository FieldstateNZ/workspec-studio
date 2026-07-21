import { describe, expect, it } from 'vitest';
import {
  API_VERSION,
  ARTIFACT_KINDS,
  CATALOG_SCHEMA_DIRECTIVE,
  CATALOG_SCHEMA_URL,
  DECISION_SCHEMA_DIRECTIVE,
  DECISION_SCHEMA_URL,
  DECISION_SCHEMA_PACKAGE,
  SCHEMA_BASE_URL,
  SCHEMA_VERSION,
  TYPE_DIRECTORIES,
  schemaDirective,
  typeDirectoryFor,
} from './index.js';

describe('@workspec/decision-schema', () => {
  it('exports its package identity', () => {
    expect(DECISION_SCHEMA_PACKAGE).toBe('@workspec/decision-schema');
  });

  it('exposes the artifact schema version', () => {
    expect(SCHEMA_VERSION).toBe('v1alpha1');
  });

  it('carries a k8s-style apiVersion for the v1alpha1 group', () => {
    expect(API_VERSION).toBe('workspec.io/v1alpha1');
  });

  it('derives the published $schema URLs from the base URL', () => {
    expect(SCHEMA_BASE_URL).toBe('https://schema.workspec.io/v1alpha1/');
    expect(DECISION_SCHEMA_URL).toBe(`${SCHEMA_BASE_URL}decision.schema.json`);
    expect(CATALOG_SCHEMA_URL).toBe(`${SCHEMA_BASE_URL}catalog.schema.json`);
  });

  it('builds the yaml-language-server directive header', () => {
    expect(schemaDirective(DECISION_SCHEMA_URL)).toBe(
      `# yaml-language-server: $schema=${DECISION_SCHEMA_URL}\n`,
    );
    expect(DECISION_SCHEMA_DIRECTIVE).toContain('# yaml-language-server: $schema=');
    expect(DECISION_SCHEMA_DIRECTIVE).toContain('decision.schema.json');
    expect(CATALOG_SCHEMA_DIRECTIVE).toContain('catalog.schema.json');
  });
});

describe('TYPE_DIRECTORIES', () => {
  it('maps each owned kind to its .workspec directory (discovery is a directory walk, not a suffix/glob)', () => {
    expect(typeDirectoryFor('Decision')).toBe('.workspec/decisions');
    expect(typeDirectoryFor('Catalog')).toBe('.workspec/catalogs');
    expect(Object.keys(TYPE_DIRECTORIES).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });
});
