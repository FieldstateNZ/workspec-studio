// Fetches the whole loaded `C4Model` from the host server's one-shot
// convenience endpoint (`GET /api/model` — the server runs `loadC4Model`
// itself, so the browser gets one round trip instead of reconstructing the
// tree client-side over the generic file-source proxy). `C4Model.elements`
// travels the wire as nested plain objects (`Record`, not `Map` — JSON has no
// Map); this reconstructs the `ReadonlyMap`s every `@workspec/c4-ui`
// component expects.
import type { C4Diagnostic, C4Model, C4ModelSpec, ElementKind, LoadedElement, ResolvedDiagram } from '@workspec/c4-model';

interface C4ModelWire {
  elements: Record<ElementKind, Record<string, LoadedElement>>;
  diagrams: readonly ResolvedDiagram[];
  spec: C4ModelSpec;
  diagnostics: readonly C4Diagnostic[];
}

async function fail(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error !== undefined) detail = body.error;
  } catch {
    /* non-JSON body */
  }
  throw new Error(`${response.status} ${detail}`);
}

export async function fetchModel(base = ''): Promise<C4Model> {
  const res = await fetch(`${base}/api/model`);
  if (!res.ok) await fail(res);
  const wire = (await res.json()) as C4ModelWire;

  const elements = Object.fromEntries(
    Object.entries(wire.elements).map(([kind, bySlug]) => [kind, new Map(Object.entries(bySlug))]),
  ) as unknown as Record<ElementKind, ReadonlyMap<string, LoadedElement>>;

  return { elements, diagrams: wire.diagrams, spec: wire.spec, diagnostics: wire.diagnostics };
}
