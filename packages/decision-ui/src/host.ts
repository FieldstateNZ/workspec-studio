import type { Decision, DecisionRepositoryPort, LinkType, Ref } from '@workspec/decision-schema';

export interface LinkTarget {
  kind: string;
  label: string;
  target?: string;
}

export type LinkResolution =
  { resolved: false } | { resolved: true; href?: string; onClick?: () => void; title?: string };

export type LinkResolver = (link: LinkType) => LinkResolution;

export interface DecisionStudioCapabilities {
  /** Whether this host permits repository writes from the editor. */
  editDecision: boolean;
}

/** The complete host contract for repository-native Decision records. */
export interface DecisionStudioHost {
  repository: DecisionRepositoryPort;
  capabilities: DecisionStudioCapabilities;
  links?: LinkResolver;
  navigate?: (target: LinkTarget) => void;
}

export function createInertLinkResolver(): LinkResolver {
  return () => ({ resolved: false });
}

const repositoryIds = new WeakMap<DecisionRepositoryPort, string>();
let repositorySeq = 0;

export function repositoryId(repository: DecisionRepositoryPort): string {
  let id = repositoryIds.get(repository);
  if (id === undefined) {
    id = `repo:${(repositorySeq += 1)}`;
    repositoryIds.set(repository, id);
  }
  return id;
}

function slugFromRef(ref: Ref): string | null {
  if (!ref.endsWith('.yaml')) return null;
  const withoutExtension = ref.slice(0, -'.yaml'.length);
  const lastSlash = withoutExtension.lastIndexOf('/');
  const slug = lastSlash === -1 ? withoutExtension : withoutExtension.slice(lastSlash + 1);
  return slug.length > 0 ? slug : null;
}

/** Filename identity is canonical; metadata.slug is an optional assertion. */
export function decisionSlug(decision: Decision, ref: Ref): string {
  return decision.metadata.slug ?? slugFromRef(ref) ?? ref;
}
