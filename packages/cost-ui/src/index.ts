// @workspec/cost-ui — C0 bootstrap.
//
// Depends on cost-engine + cost-schema + @workspec/design. Host-agnostic
// React views land starting a later slice (the host provider contract in
// C5) — for now this package exports only its own identity, so downstream
// packages have something real to wire against and typecheck.
//
// Styles ship compiled and separate: import `@workspec/cost-ui/styles.css`.
export const COST_UI_PACKAGE = '@workspec/cost-ui' as const;
