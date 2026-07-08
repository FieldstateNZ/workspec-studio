import { describe, expect, it } from 'vitest';
import { layoutFactory } from '../../test/helpers/factories.js';
import { parseLayoutYaml } from './parse-layout-yaml.js';
import { serializeLayout } from './serialize-layout.js';

describe('serializeLayout', () => {
  it('round-trips: parse -> serialize -> parse -> deep-equal', () => {
    const layout = layoutFactory({
      nodes: {
        architect: { x: 80, y: 200, width: 240, height: 120 },
        __system__: { x: 400, y: 200 },
      },
      edges: {
        'architect->__system__': {
          waypoints: [
            { x: 200, y: 220 },
            { x: 300, y: 220 },
          ],
        },
      },
      viewport: { x: 0, y: 0, zoom: 1.5 },
    });

    const yamlText = serializeLayout(layout);
    const reparsed = parseLayoutYaml(yamlText);

    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.data).toEqual(layout);
    }
  });

  it('round-trips an empty-nodes layout', () => {
    const layout = layoutFactory();
    const reparsed = parseLayoutYaml(serializeLayout(layout));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.data).toEqual(layout);
    }
  });
});
