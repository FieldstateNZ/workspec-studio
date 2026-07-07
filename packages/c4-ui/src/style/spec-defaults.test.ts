import { describe, expect, it } from 'vitest';
import { Spec } from '@workspec/c4-schema';
import {
  DEFAULT_CONNECTION_STYLES,
  DEFAULT_ELEMENT_STYLES,
  resolveConnectionStyle,
  resolveElementStyle,
} from './spec-defaults.js';

const EMPTY_SPEC = Spec.parse({});

describe('resolveElementStyle', () => {
  it('falls back to the Enterprise default for every known kind when the spec has no override', () => {
    expect(resolveElementStyle('actor', EMPTY_SPEC)).toEqual(DEFAULT_ELEMENT_STYLES.actor);
    expect(resolveElementStyle('database', EMPTY_SPEC)).toEqual(DEFAULT_ELEMENT_STYLES.database);
    expect(resolveElementStyle('queue', EMPTY_SPEC)).toEqual(DEFAULT_ELEMENT_STYLES.queue);
  });

  it('shapes per Enterprise: database is a cylinder, queue is a pill, everything else is a box', () => {
    expect(resolveElementStyle('database', EMPTY_SPEC).shape).toBe('cylinder');
    expect(resolveElementStyle('queue', EMPTY_SPEC).shape).toBe('pill');
    expect(resolveElementStyle('container', EMPTY_SPEC).shape).toBe('box');
    expect(resolveElementStyle('actor', EMPTY_SPEC).shape).toBe('box');
  });

  it('external-system defaults to the external variant (dashed border)', () => {
    expect(resolveElementStyle('external-system', EMPTY_SPEC).variant).toBe('external');
  });

  it('honours a spec.yaml accent override for a known kind, keeping its other defaults', () => {
    const spec = Spec.parse({ elements: { actor: { accent: '#FF00FF' } } });
    const resolved = resolveElementStyle('actor', spec);
    expect(resolved.accent).toBe('#FF00FF');
    expect(resolved.icon).toBe(DEFAULT_ELEMENT_STYLES.actor?.icon);
    expect(resolved.shape).toBe(DEFAULT_ELEMENT_STYLES.actor?.shape);
  });

  it('honours a full override (accent, icon, shape, variant) for a known kind', () => {
    const spec = Spec.parse({
      elements: { container: { accent: '#123456', icon: 'server', shape: 'pill', variant: 'external' } },
    });
    expect(resolveElementStyle('container', spec)).toEqual({
      accent: '#123456',
      icon: 'server',
      shape: 'pill',
      variant: 'external',
    });
  });

  it('ignores an unrecognised shape override and falls back to the default shape', () => {
    const spec = Spec.parse({ elements: { actor: { shape: 'not-a-real-shape' } } });
    expect(resolveElementStyle('actor', spec).shape).toBe('box');
  });

  it('falls back to a design-token accent (not a hardcoded hue) for a kind with no Enterprise default', () => {
    const resolved = resolveElementStyle('totally-unknown-kind', EMPTY_SPEC);
    expect(resolved.accent).toBe('var(--ink-fade)');
    expect(resolved.shape).toBe('box');
  });

  it('falls back the same way when no spec is supplied at all', () => {
    expect(resolveElementStyle('actor', undefined)).toEqual(DEFAULT_ELEMENT_STYLES.actor);
    expect(resolveElementStyle(null, undefined).accent).toBe('var(--ink-fade)');
  });
});

describe('resolveConnectionStyle', () => {
  it('falls back to the Enterprise default for every built-in category', () => {
    expect(resolveConnectionStyle('interaction', EMPTY_SPEC)).toEqual(DEFAULT_CONNECTION_STYLES.interaction);
    expect(resolveConnectionStyle('data', EMPTY_SPEC)).toEqual(DEFAULT_CONNECTION_STYLES.data);
    expect(resolveConnectionStyle('governance', EMPTY_SPEC)).toEqual(DEFAULT_CONNECTION_STYLES.governance);
    expect(resolveConnectionStyle('identity', EMPTY_SPEC)).toEqual(DEFAULT_CONNECTION_STYLES.identity);
  });

  it('governance defaults to a dashed line, the rest solid', () => {
    expect(resolveConnectionStyle('governance', EMPTY_SPEC).style).toBe('dashed');
    expect(resolveConnectionStyle('data', EMPTY_SPEC).style).toBe('solid');
  });

  it('honours a spec.yaml override for a built-in category', () => {
    const spec = Spec.parse({ connections: { data: { accent: '#000000', style: 'dashed' } } });
    expect(resolveConnectionStyle('data', spec)).toEqual({ accent: '#000000', style: 'dashed' });
  });

  it('falls back to a design-token accent for no category / an unknown category', () => {
    expect(resolveConnectionStyle(null, EMPTY_SPEC).accent).toBe('var(--ink-fade)');
    expect(resolveConnectionStyle('not-a-real-category', EMPTY_SPEC).accent).toBe('var(--ink-fade)');
  });
});
