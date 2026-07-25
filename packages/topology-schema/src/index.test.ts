import { describe, expect, it } from 'vitest';
import {
  API_VERSION,
  ARTIFACT_KINDS,
  ENVIRONMENT_SCHEMA_DIRECTIVE,
  ENVIRONMENT_SCHEMA_URL,
  RESOURCE_SCHEMA_DIRECTIVE,
  RESOURCE_SCHEMA_URL,
  SCHEMA_BASE_URL,
  SCHEMA_VERSION,
  TOPOLOGY_LAYOUT_SCHEMA_DIRECTIVE,
  TOPOLOGY_LAYOUT_SCHEMA_URL,
  TOPOLOGY_SCHEMA_DIRECTIVE,
  TOPOLOGY_SCHEMA_PACKAGE,
  TOPOLOGY_SCHEMA_URL,
  TYPE_DIRECTORIES,
  isLayoutFile,
  layoutPathFor,
  schemaDirective,
  typeDirectoryFor,
} from './index.js';

describe('@workspec/topology-schema', () => {
  it('exports its package identity', () => {
    expect(TOPOLOGY_SCHEMA_PACKAGE).toBe('@workspec/topology-schema');
  });

  it('exposes the artifact schema version', () => {
    expect(SCHEMA_VERSION).toBe('v1alpha1');
  });

  it('carries a k8s-style apiVersion for the v1alpha1 group', () => {
    expect(API_VERSION).toBe('workspec.io/v1alpha1');
  });

  it('derives the published $schema URLs from the base URL', () => {
    expect(SCHEMA_BASE_URL).toBe('https://schema.workspec.io/v1alpha1/');
    expect(TOPOLOGY_SCHEMA_URL).toBe(`${SCHEMA_BASE_URL}topology.schema.json`);
    expect(RESOURCE_SCHEMA_URL).toBe(`${SCHEMA_BASE_URL}resource.schema.json`);
    expect(ENVIRONMENT_SCHEMA_URL).toBe(`${SCHEMA_BASE_URL}environment.schema.json`);
    expect(TOPOLOGY_LAYOUT_SCHEMA_URL).toBe(`${SCHEMA_BASE_URL}topology-layout.schema.json`);
  });

  it('builds the yaml-language-server directive header', () => {
    expect(schemaDirective(TOPOLOGY_SCHEMA_URL)).toBe(
      `# yaml-language-server: $schema=${TOPOLOGY_SCHEMA_URL}\n`,
    );
    expect(TOPOLOGY_SCHEMA_DIRECTIVE).toContain('topology.schema.json');
    expect(RESOURCE_SCHEMA_DIRECTIVE).toContain('resource.schema.json');
    expect(ENVIRONMENT_SCHEMA_DIRECTIVE).toContain('environment.schema.json');
    expect(TOPOLOGY_LAYOUT_SCHEMA_DIRECTIVE).toContain('topology-layout.schema.json');
  });
});

describe('TYPE_DIRECTORIES', () => {
  it('maps each owned kind to its .workspec directory (discovery is a directory walk, not a suffix/glob)', () => {
    expect(typeDirectoryFor('Topology')).toBe('.workspec/topologies');
    expect(typeDirectoryFor('Resource')).toBe('.workspec/resources');
    expect(typeDirectoryFor('Environment')).toBe('.workspec/environments');
    expect(Object.keys(TYPE_DIRECTORIES).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });

  it('does not register layout as a fourth kind', () => {
    expect(ARTIFACT_KINDS).not.toContain('Layout');
  });
});

describe('layout path helpers', () => {
  it('builds and recognises the .layout/ path for a topology slug', () => {
    const path = layoutPathFor('web-app');
    expect(path).toBe('.workspec/topologies/.layout/web-app.yaml');
    expect(isLayoutFile(path)).toBe(true);
  });
});
