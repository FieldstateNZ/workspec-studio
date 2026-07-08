import { describe, expect, it } from 'vitest';
import { locateYamlPath } from './locate-yaml-path.js';

const DIAGRAM_YAML = `title: Context
type: c4-context
nodes:
  - slug: architect
  - component: diagram-editor
edges:
  - from: architect
    to: __system__
`;

const LAYOUT_YAML = `version: 1
nodes:
  architect:
    x: 0
    y: 0
edges:
  "a->b":
    waypoints: []
`;

describe('locateYamlPath', () => {
  it('locates an exact array-index path to a sequence entry', () => {
    expect(locateYamlPath(DIAGRAM_YAML, ['nodes', 0])).toEqual({ line: 4, col: 5 });
    expect(locateYamlPath(DIAGRAM_YAML, ['nodes', 1])).toEqual({ line: 5, col: 5 });
    expect(locateYamlPath(DIAGRAM_YAML, ['edges', 0])).toEqual({ line: 7, col: 5 });
  });

  it('locates a string-keyed map entry (layout node/edge keys)', () => {
    expect(locateYamlPath(LAYOUT_YAML, ['nodes', 'architect'])).toEqual({ line: 4, col: 5 });
    expect(locateYamlPath(LAYOUT_YAML, ['edges', 'a->b'])).toEqual({ line: 8, col: 5 });
  });

  it('falls back to the nearest ancestor when the exact path does not exist', () => {
    // nodes[0] has no `ghost` key — falls back to nodes[0] itself.
    expect(locateYamlPath(DIAGRAM_YAML, ['nodes', 0, 'ghost'])).toEqual({ line: 4, col: 5 });
    // nodes has no index 99 — falls back to the nodes sequence.
    expect(locateYamlPath(DIAGRAM_YAML, ['nodes', 99])).toEqual(
      locateYamlPath(DIAGRAM_YAML, ['nodes']),
    );
  });

  it('falls back to the document root for a path matching nothing', () => {
    expect(locateYamlPath(DIAGRAM_YAML, ['completely', 'unknown'])).toEqual({ line: 1, col: 1 });
  });

  it('resolves the document root for an empty path', () => {
    expect(locateYamlPath(DIAGRAM_YAML, [])).toEqual({ line: 1, col: 1 });
  });

  it('returns undefined for unparseable text', () => {
    expect(locateYamlPath('title: [unclosed', ['title'])).toBeUndefined();
  });

  it('returns undefined for an empty document', () => {
    expect(locateYamlPath('', ['anything'])).toBeUndefined();
  });
});
