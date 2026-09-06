// Which element kinds the authoring palette offers, per C4 level.
//
// A verbatim port of enterprise's `paletteFor(level, lens)` — C4Toolbar.tsx
// :46-61 — with one substitution and one deletion, both forced by the model
// rather than chosen:
//
//   - enterprise keys on its own `C4Level` union; the studio's diagrams key
//     on `ResolvedDiagram.type`, a free string whose known values are
//     `c4-context` / `c4-container` / `c4-component` (see c4-schema's
//     `diagram-thin.ts:9`). The mapping below is 1:1 with enterprise's.
//   - enterprise's `'code'` branch (`class` / `interface` / `function`) is
//     dropped: those three are STYLE keys in `spec-defaults.ts`, not
//     `ELEMENT_KINDS`, so `POST /api/elements` cannot create them. Offering
//     them would be a palette of buttons that always fail.
//
// Everything else is deliberately identical, INCLUDING the omissions a
// reader may find surprising and must not "fix":
//   - `system` is never offered. At the context level the system IS the
//     boundary the diagram is about; enterprise offers only the things that
//     surround it.
//   - the logical container lens offers `domain`, not `container` — the
//     lens split is the whole point of the two views.
//   - an unrecognised diagram type falls back to the context palette, which
//     is enterprise's `default` branch.

import type { ElementKind } from '@workspec/c4-model';
import type { C4Lens } from '../c4/index.js';

const CONTEXT: readonly ElementKind[] = ['actor', 'external-system'];
const CONTAINER_LOGICAL: readonly ElementKind[] = ['domain', 'external-system'];
const CONTAINER_DEPLOYMENT: readonly ElementKind[] = [
  'container',
  'database',
  'queue',
  'external-system',
];
const COMPONENT: readonly ElementKind[] = ['component', 'database', 'queue'];

/**
 * The palette for a diagram, given its `ResolvedDiagram.type` and — for a
 * container diagram, the only level with two views — the lens on screen.
 *
 * @param diagramType the diagram's `type` field, e.g. `'c4-container'`.
 * @param lens which container view is showing; ignored at other levels.
 */
export function paletteForDiagram(diagramType: string, lens: C4Lens): readonly ElementKind[] {
  switch (diagramType) {
    case 'c4-container':
      return lens === 'logical' ? CONTAINER_LOGICAL : CONTAINER_DEPLOYMENT;
    case 'c4-component':
      return COMPONENT;
    case 'c4-context':
    default:
      return CONTEXT;
  }
}
