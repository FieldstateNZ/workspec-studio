/** A stable, valid SVG element id for one accent colour's arrowhead `<marker>` — shared by the canvas and `render-svg.ts` so an edge's marker reference always resolves to a `<marker>` actually defined in that same document's `<defs>`. */
export function markerIdFor(accent: string): string {
  return `c4-arrow-${accent.replace(/[^a-zA-Z0-9]/g, '') || 'default'}`;
}

/** The distinct accents (in first-seen order) among a set of resolved connection styles — one `<marker>` is defined per distinct accent, not per edge. */
export function uniqueAccents(accents: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const accent of accents) {
    if (seen.has(accent)) continue;
    seen.add(accent);
    unique.push(accent);
  }
  return unique;
}
