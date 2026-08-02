import {
  Box,
  Boxes,
  Braces,
  Brackets,
  CheckSquare,
  Component,
  Database,
  ExternalLink,
  GitMerge,
  HelpCircle,
  Lightbulb,
  Package,
  Parentheses,
  Server,
  StickyNote,
  Table,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Ported from the enterprise `c4-node-types.ts` icon half. The COLOUR half
// (NODE_TYPE_COLOURS) is deliberately NOT ported — accents resolve through
// style/spec-defaults.ts's design-token entries instead (the reconciled
// single source of truth; see that file's header).

/**
 * Lucide icons addressable by string key, so a project spec can name an
 * element's icon (e.g. `icon: database`) and the canvas resolve it. An
 * unknown key resolves to null so the caller falls back to the kind's
 * default icon.
 */
export const ICON_BY_KEY: Record<string, LucideIcon> = {
  box: Box,
  boxes: Boxes,
  braces: Braces,
  brackets: Brackets,
  'check-square': CheckSquare,
  component: Component,
  database: Database,
  'external-link': ExternalLink,
  'git-merge': GitMerge,
  'help-circle': HelpCircle,
  lightbulb: Lightbulb,
  package: Package,
  parentheses: Parentheses,
  server: Server,
  'sticky-note': StickyNote,
  table: Table,
  user: User,
  users: Users,
};

export function iconForKey(key: string | undefined): LucideIcon | null {
  if (key === undefined || key === '') return null;
  return ICON_BY_KEY[key] ?? null;
}

/** Display label per C4 node kind (enterprise `labelForType`, verbatim). */
export function labelForType(nodeType: string): string {
  switch (nodeType) {
    case 'system':
      return 'System';
    case 'external-system':
      return 'External System';
    case 'actor':
      return 'Actor';
    case 'participant':
      return 'Participant';
    case 'container':
      return 'Container';
    case 'component':
      return 'Feature'; // C4 component = WorkSpec feature
    case 'database':
      return 'Database';
    case 'domain':
      return 'Domain';
    case 'feature':
      return 'Feature';
    case 'class':
      return 'Class';
    case 'interface':
      return 'Interface';
    case 'function':
      return 'Function';
    case 'entity':
      return 'Entity';
    default:
      return nodeType.replace(/-/g, ' ');
  }
}
