// Maps a resolved element style's `icon` name (a lucide-react icon name, per
// Enterprise's `DEFAULT_ELEMENT_STYLES` — see spec-defaults.ts) to the actual
// icon component. Explicit imports (not a dynamic lookup over the whole
// lucide-react namespace) keep the bundle limited to the icons Enterprise's
// default registry actually names.
import {
  Boxes,
  Box as BoxIcon,
  Braces,
  Brackets,
  Database,
  ExternalLink,
  GitMerge,
  Package,
  Parentheses,
  Server,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  user: User,
  box: BoxIcon,
  'external-link': ExternalLink,
  server: Server,
  package: Package,
  database: Database,
  'git-merge': GitMerge,
  boxes: Boxes,
  braces: Braces,
  brackets: Brackets,
  parentheses: Parentheses,
};

/** The icon component for a resolved style's `icon` name, falling back to the generic box glyph for an unrecognised name. */
export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? BoxIcon;
}
