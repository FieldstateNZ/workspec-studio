// elkjs ships `elk.bundled.d.ts`/`elk-api.d.ts` written with `export default`,
// which is only a genuine single-value CJS export under TypeScript's
// Node16/NodeNext module-format rules when declared via `export =`. Because
// elkjs's own package.json has no `"type": "module"`, NodeNext resolves
// those declaration files as CommonJS format, where `export default` does
// NOT count as a real default — TypeScript falls back to a *synthetic*
// default (typed as the whole module namespace), and `new ELK()` fails with
// "This expression is not constructable." This ambient re-declaration fixes
// only the shape our code actually imports (the default-exported
// constructor); everything else (`ElkNode`, `ElkExtendedEdge`, ...) keeps
// resolving to elkjs's own `elk-api.d.ts` unaffected, since named exports
// aren't part of this mismatch. Delete this file if a future elkjs release
// ships `export =`-based (or otherwise NodeNext-correct) declarations.
declare module 'elkjs/lib/elk.bundled.js' {
  import type { ELK, ELKConstructorArguments } from 'elkjs/lib/elk-api.js';

  const ElkConstructor: { new (args?: ELKConstructorArguments): ELK };
  export = ElkConstructor;
}
