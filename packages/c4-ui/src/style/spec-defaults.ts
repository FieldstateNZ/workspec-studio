// RETIRED COPY (S4, #120): the canonical Enterprise-defaults data module
// moved to the C4 layer (`src/c4/style/spec-defaults.ts` — formerly
// `@workspec/canvas-c4/style/spec-defaults`, folded in-package by ADR i) —
// this file is now a pure re-export so every in-package import keeps
// working while there is exactly ONE source of truth for the C4 default
// styles. The zero-local-tokens VALUE exemption this file used to carry
// moved with the data (see `token-audit.test.ts`'s exemptions); this file
// is grep-clean.
export {
  DEFAULT_CONNECTION_STYLES,
  DEFAULT_ELEMENT_STYLES,
  resolveConnectionStyle,
  resolveElementStyle,
} from '../c4/style/spec-defaults.js';
export type {
  ConnectionLineStyle,
  ElementShape,
  ResolvedConnectionStyle,
  ResolvedElementStyle,
} from '../c4/style/spec-defaults.js';
