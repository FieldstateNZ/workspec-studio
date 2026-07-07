// "Export ADR" — render the CURRENT state of a decision to a deterministic
// Markdown ADR and download it. Uses the SAME renderer as the CLI's `render-adr`
// (`buildAdrModel` → `renderAdrMarkdown` from @workspec/decision-engine), so the
// download byte-for-byte matches what the terminal produces.
import { buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';
import { resolveCatalogRef } from '@workspec/decision-ui';
import type { DecisionRepositoryPort, Ref } from '@workspec/decision-schema';

/** Render the decision at `decisionRef` (with its resolved catalog) to ADR Markdown. */
export async function renderAdr(
  repository: DecisionRepositoryPort,
  decisionRef: Ref,
): Promise<{ filename: string; markdown: string }> {
  const decision = await repository.readDecision(decisionRef);
  const catalog = await repository.readCatalog(resolveCatalogRef(decisionRef, decision));
  const markdown = renderAdrMarkdown(buildAdrModel(decision, catalog));
  const filename = `${decision.metadata.id}.adr.md`;
  return { filename, markdown };
}

/** Trigger a browser download of `text` as `filename` (no server round-trip). */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on a later tick: some browsers cancel an in-flight download if the
  // blob URL is revoked synchronously right after click().
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
