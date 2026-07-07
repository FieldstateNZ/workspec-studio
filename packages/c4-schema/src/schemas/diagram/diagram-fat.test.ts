import { describe, expect, it } from 'vitest';
import { FatDiagram } from './diagram-fat.js';

describe('FatDiagram', () => {
  it('accepts the legacy shape emitted by the MCP create_diagram tool', () => {
    const result = FatDiagram.safeParse({
      title: 'Container',
      type: 'c4-container',
      nodes: [{ id: 'api', type: 'container', label: 'API Server' }],
      edges: [{ from: 'api', to: 'db' }],
      tags: { backend: { color: '#4A90D9' } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional top-level source field', () => {
    const result = FatDiagram.safeParse({
      title: 'Container',
      type: 'c4-container',
      nodes: [],
      edges: [],
      source: 'emitted by MCP create_diagram',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a fat node with logical_type and deployment_target', () => {
    const result = FatDiagram.safeParse({
      title: 'Container',
      type: 'c4-container',
      nodes: [
        {
          id: 'billing',
          type: 'domain',
          label: 'Billing',
          logical_type: 'domain',
          deployment_target: 'container',
        },
      ],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a node missing its id', () => {
    const result = FatDiagram.safeParse({
      title: 'Container',
      type: 'c4-container',
      nodes: [{ type: 'container', label: 'API Server' }],
      edges: [],
    });
    expect(result.success).toBe(false);
  });
});
