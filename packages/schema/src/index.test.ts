import { describe, expect, it } from 'vitest';
import {
  API_VERSION,
  CATALOG_FILE_GLOB,
  CATALOG_FILE_SUFFIX,
  CATALOG_SCHEMA_DIRECTIVE,
  CATALOG_SCHEMA_URL,
  DECISION_FILE_GLOB,
  DECISION_FILE_SUFFIX,
  DECISION_SCHEMA_DIRECTIVE,
  DECISION_SCHEMA_URL,
  SCHEMA_BASE_URL,
  SCHEMA_VERSION,
  isCatalogFile,
  isDecisionFile,
  schemaDirective,
} from './index.js';

describe('@workspec/decision-schema constants', () => {
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

describe('normative file naming', () => {
  it('defines the suffixes and globs', () => {
    expect(DECISION_FILE_SUFFIX).toBe('.decision.yaml');
    expect(CATALOG_FILE_SUFFIX).toBe('.catalog.yaml');
    expect(DECISION_FILE_GLOB).toBe('*.decision.yaml');
    expect(CATALOG_FILE_GLOB).toBe('*.catalog.yaml');
  });

  it('classifies filenames by suffix', () => {
    expect(isDecisionFile('hosting-platform.decision.yaml')).toBe(true);
    expect(isDecisionFile('platform.catalog.yaml')).toBe(false);
    expect(isCatalogFile('platform.catalog.yaml')).toBe(true);
    expect(isCatalogFile('hosting-platform.decision.yaml')).toBe(false);
    // A plain .yaml is neither.
    expect(isDecisionFile('notes.yaml')).toBe(false);
    expect(isCatalogFile('notes.yaml')).toBe(false);
  });
});
