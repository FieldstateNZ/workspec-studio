import { describe, expect, it } from 'vitest';
import {
  assertRoundTrip,
  cucumberEmitter,
  CUCUMBER_CONVENTIONS,
  emitters,
  EMITTER_TARGET_SCHEMA,
  getEmitter,
  junitEmitter,
  JUNIT_CONVENTIONS,
  mockCucumberRun,
  mockJunitRun,
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

  it('ships both the cucumber and junit emitters, registered by name', () => {
    expect(cucumberEmitter.name).toBe('cucumber');
    expect(junitEmitter.name).toBe('junit');
    expect(emitters).toContain(cucumberEmitter);
    expect(emitters).toContain(junitEmitter);
    expect(emitters).toHaveLength(2);
    expect(getEmitter('cucumber')).toBe(cucumberEmitter);
    expect(getEmitter('junit')).toBe(junitEmitter);
    expect(getEmitter('nope')).toBeUndefined();
  });

  it('declares the four cucumber spec §3 conventions, in the spec table order', () => {
    expect(cucumberEmitter.conventions).toBe(CUCUMBER_CONVENTIONS);
    expect(CUCUMBER_CONVENTIONS.map((c) => c.name)).toEqual([
      'feature-file-per-rule',
      'rule-groups-scenarios',
      'req-tag-on-scenario',
      'outline-from-examples',
    ]);
  });

  it('declares the four junit conventions, each with its own stable name', () => {
    expect(junitEmitter.conventions).toBe(JUNIT_CONVENTIONS);
    expect(JUNIT_CONVENTIONS.map((c) => c.name)).toEqual([
      'testsuite-file-per-rule',
      'rule-groups-testcases',
      'req-slug-as-testcase-name',
      'outline-row-fold',
    ]);
  });

  it('exports the conformance harness and both mock runners', () => {
    expect(typeof assertRoundTrip).toBe('function');
    expect(typeof roundTrip).toBe('function');
    expect(typeof mockCucumberRun).toBe('function');
    expect(typeof mockJunitRun).toBe('function');
  });
});
