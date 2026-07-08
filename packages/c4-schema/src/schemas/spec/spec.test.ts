import { describe, expect, it } from 'vitest';
import { specFactory } from '../../../test/helpers/factories.js';
import { Spec } from './spec.js';

describe('Spec', () => {
  it('accepts an empty object (type/version optional, maps default empty)', () => {
    const result = Spec.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.elements).toEqual({});
      expect(result.data.connections).toEqual({});
    }
  });

  it('accepts a v2 spec with elements, connections, and surfaces', () => {
    const result = Spec.safeParse(
      specFactory({
        surfaces: {
          light: { surface: '#ffffff', ink: '#0f172a', page: '#f8fafc' },
          dark: { surface: '#1e293b' },
        },
        elements: {
          actor: { accent: '#4A90D9', icon: 'user', shape: 'box' },
          'external-system': {
            accent: '#64748b',
            icon: 'external-link',
            shape: 'box',
            variant: 'external',
          },
          database: { accent: 'hsl(186 79% 35%)', icon: 'database', shape: 'cylinder' },
        },
        connections: {
          interaction: { accent: '#64748b', style: 'solid' },
          governance: { accent: '#9C27B0', style: 'dashed' },
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a legacy type label and older version number', () => {
    const result = Spec.safeParse({ type: 'spec', version: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts unknown shape/style/variant strings (compiler normalises, schema never hard-fails)', () => {
    const result = Spec.safeParse(
      specFactory({
        elements: {
          actor: { accent: '#4A90D9', icon: 'user', shape: 'triangle', variant: 'internal' },
        },
        connections: { data: { accent: '#4CAF50', style: 'dotted' } },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('passes legacy v1 keys through on element styles and the spec root', () => {
    const result = Spec.safeParse({
      type: 'style',
      version: 2,
      'legacy-root-key': true,
      elements: { actor: { 'background-color': '#fff', 'highlight-color': '#eee' } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.elements.actor).toMatchObject({ 'background-color': '#fff' });
    }
  });

  it('accepts a null variant', () => {
    const result = Spec.safeParse(specFactory({ elements: { actor: { variant: null } } }));
    expect(result.success).toBe(true);
  });

  it('rejects a non-string accent', () => {
    // Deliberately-invalid runtime input, so a plain literal rather than
    // the `Partial<Spec>`-typed factory overrides.
    const result = Spec.safeParse({
      type: 'style',
      version: 2,
      elements: { actor: { accent: 42 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects elements given as an array instead of a map', () => {
    const result = Spec.safeParse({ type: 'style', version: 2, elements: [{ accent: '#fff' }] });
    expect(result.success).toBe(false);
  });

  it('rejects a non-number version', () => {
    const result = Spec.safeParse({ type: 'style', version: 'two' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string surface color', () => {
    const result = Spec.safeParse({
      type: 'style',
      version: 2,
      surfaces: { light: { surface: 7 } },
    });
    expect(result.success).toBe(false);
  });
});
