import { describe, expect, it } from 'vitest';
import { buildModel, ENGINE_TARGET_SCHEMA, TRACE_MODEL_PACKAGE } from './index.js';

describe('@workspec/trace-model', () => {
  it('exports its package identity', () => {
    expect(TRACE_MODEL_PACKAGE).toBe('@workspec/trace-model');
  });

  it('names the req-schema package it consumes input types from', () => {
    expect(ENGINE_TARGET_SCHEMA).toBe('@workspec/req-schema');
  });

  it('exports the derivation engine', () => {
    expect(typeof buildModel).toBe('function');
  });
});
