import { describe, expect, it } from 'vitest';
import {
  assertRoundTrip,
  cucumberEmitter,
  CUCUMBER_CONVENTIONS,
  emitters,
  EMITTER_TARGET_SCHEMA,
  getEmitter,
  mockCucumberRun,
  roundTrip,
  TRACE_EMITTERS_PACKAGE,
} from './index.js';

describe('@workspec/trace-emitters', () => {
  it('exports its package identity', () => {
    expect(TRACE_EMITTERS_PACKAGE).toBe('@workspec/trace-emitters');
  });

  it('names the req-schema package it consumes types from', () => {
    expect(EMITTER_TARGET_SCHEMA).toBe('@workspec/req-schema');
  });

  it('ships the cucumber emitter, registered by name', () => {
    expect(cucumberEmitter.name).toBe('cucumber');
    expect(emitters).toContain(cucumberEmitter);
    expect(getEmitter('cucumber')).toBe(cucumberEmitter);
    expect(getEmitter('nope')).toBeUndefined();
  });

  it('declares the four spec §3 conventions, in the spec table order', () => {
    expect(cucumberEmitter.conventions).toBe(CUCUMBER_CONVENTIONS);
    expect(CUCUMBER_CONVENTIONS.map((c) => c.name)).toEqual([
      'feature-file-per-rule',
      'rule-groups-scenarios',
      'req-tag-on-scenario',
      'outline-from-examples',
    ]);
  });

  it('exports the conformance harness and cucumber mock runner', () => {
    expect(typeof assertRoundTrip).toBe('function');
    expect(typeof roundTrip).toBe('function');
    expect(typeof mockCucumberRun).toBe('function');
  });
});
