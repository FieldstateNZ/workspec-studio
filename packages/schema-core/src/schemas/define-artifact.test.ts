import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { API_VERSION } from '../constants.js';
import { defineArtifact } from './define-artifact.js';

const Widget = z.object({ label: z.string().min(1) }).describe('A test spec body.');
const WidgetArtifact = defineArtifact('Widget', Widget);

describe('defineArtifact', () => {
  it('builds an envelope requiring apiVersion, kind, metadata, and spec', () => {
    const result = WidgetArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Widget',
      metadata: { slug: 'my-widget' },
      spec: { label: 'Hello' },
    });
    expect(result.success).toBe(true);
  });

  it('fixes apiVersion to the shared API_VERSION literal', () => {
    const result = WidgetArtifact.safeParse({
      apiVersion: 'workspec.io/v0',
      kind: 'Widget',
      metadata: {},
      spec: { label: 'Hello' },
    });
    expect(result.success).toBe(false);
  });

  it('fixes kind to the literal passed to defineArtifact', () => {
    const result = WidgetArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'NotAWidget',
      metadata: {},
      spec: { label: 'Hello' },
    });
    expect(result.success).toBe(false);
  });

  it('validates spec against the schema passed in', () => {
    const result = WidgetArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Widget',
      metadata: {},
      spec: {},
    });
    expect(result.success).toBe(false);
  });

  it('metadata is optional-slug, so an empty metadata object is valid', () => {
    const result = WidgetArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Widget',
      metadata: {},
      spec: { label: 'Hello' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown top-level key with no spec-level cost (extra keys silently stripped, not rejected)', () => {
    const result = WidgetArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Widget',
      metadata: {},
      spec: { label: 'Hello' },
      extra: 'field',
    });
    expect(result.success).toBe(true);
    expect(result.success && 'extra' in result.data).toBe(false);
  });
});
