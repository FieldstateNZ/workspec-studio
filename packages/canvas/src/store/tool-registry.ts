import type { Tool } from '../tools/tool-base.js';

/**
 * Instance-scoped lookup of tools by name. Replaces the enterprise's
 * module-level `TOOLS` map (issue #117) so two canvases on one page can
 * carry different tool sets. `createCanvasStore` registers the select
 * tool by default; hosts register the rest (S2 ships the full set).
 */
export interface ToolRegistry {
  /** Register (or replace) the tool under its `name`. */
  register: (tool: Tool) => void;
  get: (name: string) => Tool | undefined;
  names: () => readonly string[];
}

/** A fresh, empty tool registry (one per canvas instance). */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();
  return {
    register: (tool) => {
      tools.set(tool.name, tool);
    },
    get: (name) => tools.get(name),
    names: () => [...tools.keys()],
  };
}
