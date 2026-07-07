import { fileURLToPath } from 'node:url';

// Map each @workspec/* package to its TypeScript source so Vitest runs against
// source without a prior build. Mirrors tsconfig's `customConditions`, but via
// explicit aliases (robust across Vite's SSR condition resolution).
const src = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export const workspaceAliases: Record<string, string> = {
  '@workspec/decision-schema': src('schema'),
  '@workspec/decision-engine': src('engine'),
  '@workspec/decision-ui': src('ui'),
  '@workspec/decision-studio': src('studio'),
};
