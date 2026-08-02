// RETIRED COPY (S4, #120): the canonical Enterprise-defaults data module
// moved to `@workspec/canvas-c4/style/spec-defaults` in S3 (#119) — this
// file is now a pure re-export so every in-package import keeps working
// while there is exactly ONE source of truth for the C4 default styles.
// The zero-local-tokens VALUE exemption this file used to carry moved with
// the data (see packages/canvas-c4's token-audit exemptions); this file is
// grep-clean.
export {
  DEFAULT_CONNECTION_STYLES,
  DEFAULT_ELEMENT_STYLES,
  resolveConnectionStyle,
  resolveElementStyle,
} from '@workspec/canvas-c4';
export type {
  ConnectionLineStyle,
  ElementShape,
  ResolvedConnectionStyle,
  ResolvedElementStyle,
} from '@workspec/canvas-c4';
