import { slugFromPath } from '@workspec/c4-schema';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import { ELEMENT_KINDS } from '../model/element-kind.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { LoadedElements } from '../loading/load-elements.js';
import { elementLinkTargets } from './element-link-targets.js';

/** Rotates a cycle to start at its lexicographically smallest path, so the same cycle dedupes regardless of DFS start point. */
function normalizeCycle(cycle: readonly string[]): readonly string[] {
  let minIndex = 0;
  for (let i = 1; i < cycle.length; i++) {
    const candidate = cycle[i];
    const current = cycle[minIndex];
    if (candidate !== undefined && current !== undefined && candidate < current) minIndex = i;
  }
  return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
}

/**
 * Detects cycles among elements' `~/` links to one another (only edges
 * that resolve to a real element file count — a link to a doc or another
 * package can't participate in a cycle over elements). One `link-cycle`
 * warning per distinct cycle, deduped by rotation, `file` set to the
 * cycle's lexicographically-first element.
 */
export function detectLinkCycles(elements: LoadedElements): readonly C4Diagnostic[] {
  const graph = new Map<string, string[]>();
  const allPaths = new Set<string>();

  for (const kind of ELEMENT_KINDS) {
    for (const loaded of elements.byKind[kind].values()) {
      allPaths.add(loaded.path);
    }
  }
  for (const kind of ELEMENT_KINDS) {
    for (const loaded of elements.byKind[kind].values()) {
      const targets = elementLinkTargets(loaded.element.data.links).filter((target) => allPaths.has(target));
      graph.set(loaded.path, targets);
    }
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const seenCycles = new Set<string>();
  const diagnostics: C4Diagnostic[] = [];

  function visit(path: string): void {
    state.set(path, 'visiting');
    stack.push(path);

    for (const next of graph.get(path) ?? []) {
      const nextState = state.get(next);
      if (nextState === 'visiting') {
        const cycleStart = stack.indexOf(next);
        const cycle = normalizeCycle(stack.slice(cycleStart));
        const key = cycle.join(' -> ');
        if (!seenCycles.has(key) && cycle[0] !== undefined) {
          seenCycles.add(key);
          const slugs = cycle.map((p) => slugFromPath(p) ?? p);
          diagnostics.push(
            makeDiagnostic(
              'warning',
              DIAGNOSTIC_CODES.linkCycle,
              `link cycle: ${slugs.join(' -> ')} -> ${slugs[0]}`,
              cycle[0],
            ),
          );
        }
      } else if (nextState === undefined) {
        visit(next);
      }
    }

    stack.pop();
    state.set(path, 'done');
  }

  for (const path of Array.from(allPaths).sort()) {
    if (!state.has(path)) visit(path);
  }

  return diagnostics;
}
