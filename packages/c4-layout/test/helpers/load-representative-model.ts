import { createFsSource } from '@workspec/c4-model/fs';
import { loadC4Model } from '@workspec/c4-model';
import type { C4Model, ResolvedDiagram } from '@workspec/c4-model';
import { REPRESENTATIVE_ROOT } from './fixture-paths.js';

/**
 * Loads `@workspec/c4-schema`'s representative fixture through the real
 * `@workspec/c4-model` pipeline, so every test in this package exercises
 * `layoutDiagram`/`layoutModel` against genuine `ResolvedDiagram`/`Layout`
 * shapes rather than hand-typed stand-ins that could drift from what
 * `c4-model` actually produces (see the fieldstate-testing skill's rule
 * against locally hand-typed domain shapes).
 */
export async function loadRepresentativeModel(): Promise<C4Model> {
  return loadC4Model(createFsSource(REPRESENTATIVE_ROOT));
}

/** The `system-context` diagram from the representative fixture — the one with a `.layout/` file (pinned `architect` + `__system__`). */
export function findSystemContext(model: C4Model): ResolvedDiagram {
  const diagram = model.diagrams.find((d) => d.slug === 'system-context');
  if (!diagram) throw new Error('representative fixture is missing its system-context diagram');
  return diagram;
}

/** The `container` diagram from the representative fixture — `c4-container`, lens-partitioned, no `.layout/` file. */
export function findContainer(model: C4Model): ResolvedDiagram {
  const diagram = model.diagrams.find((d) => d.slug === 'container');
  if (!diagram) throw new Error('representative fixture is missing its container diagram');
  return diagram;
}
