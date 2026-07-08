/** Truncates a label to at most `maxChars`, appending an ellipsis when cut — shared by the canvas and `render-svg.ts` so a node's on-canvas text never differs between the two. */
export function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
