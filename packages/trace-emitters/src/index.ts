// @workspec/trace-emitters — the cucumber emit + ingest seam for the WorkSpec
// Traceability Workbench.
//
// An emitter is a named convention binding Rule (system-requirement) +
// scenario artifacts to a test toolchain IN BOTH DIRECTIONS: `emit(rules) →
// files` (greenfield) and `ingest(raw, meta) → TestRun` (brownfield), plus its
// declared conventions (spec §3). This is the module's PROVIDER SEAM — adding
// a framework means adding an `Emitter` and nothing else. Everything here is
// PURE and DETERMINISTIC: no IO, no DOM, no clock, no `Math.random()`;
// identical input yields byte-identical output. See
// docs/traceability/spec.md §3/§4.4/§4.5/§7.

import { REQ_SCHEMA_PACKAGE } from '@workspec/req-schema';

/** This package's own identity (mirrors `@workspec/cost-engine`'s convention). */
export const TRACE_EMITTERS_PACKAGE = '@workspec/trace-emitters' as const;

/** The req-schema package the emitters consume their artifact/evidence types from. */
export const EMITTER_TARGET_SCHEMA = REQ_SCHEMA_PACKAGE;

// ── The emitter seam (contract + types) ───────────────────────────────────────
export type {
  Emitter,
  EmitterConvention,
  EmittedFile,
  RuleInput,
  RuleWithScenarios,
  RunMeta,
  ScenarioInput,
} from './types.js';

// ── The cucumber emitter ──────────────────────────────────────────────────────
export { cucumberEmitter, CUCUMBER_CONVENTIONS } from './cucumber.js';

// ── The cucumber mock runner + JSON report shapes ─────────────────────────────
export { mockCucumberRun } from './cucumber.js';
export type {
  CucumberElement,
  CucumberFeature,
  CucumberReport,
  CucumberStatus,
  CucumberStep,
  CucumberTag,
  MockRunOptions,
} from './cucumber.js';

// ── The emitter registry ──────────────────────────────────────────────────────
export { emitters, getEmitter } from './registry.js';

// ── Round-trip conformance harness (the acceptance bar, issue #71) ────────────
export { roundTrip, assertRoundTrip } from './conformance.js';
export type { MockRunner, RoundTrip } from './conformance.js';

// ── Re-exported evidence type for consumers wiring `ingest` ───────────────────
export type { TestRun } from '@workspec/req-schema';
