// `structuredClone` is a universal runtime global (browsers, workers, and
// Node 17+ all have it) but isn't declared by `lib: ["ES2022"]` — it comes
// from `lib.dom.d.ts` or `@types/node`'s globals, and this package
// deliberately pulls in neither at build time (that's the browser-safety
// gate: no DOM assumptions, no Node assumptions). Declare it ourselves
// instead of reaching for either lib, so `structuredClone` stays typed
// without smuggling in a wider ambient surface than this package needs.
export {};

declare global {
  function structuredClone<T>(value: T): T;
}
