// The hover/focus tooltip: title, kind, description, technology, tags, and
// (when the underlying element is known and carries `links`) a Links
// section rendered through the host's `LinkResolver` — see links.tsx.

import type { ReactElement } from 'react';
import type { LoadedElement, ResolvedDiagramNode } from '@workspec/c4-model';
import { elementKey } from './element-key.js';
import type { LinkResolver } from './host.js';
import { LinksBlock, parseLinkEntries } from './links.js';

export interface TooltipContentModel {
  readonly title: string;
  readonly kind: string | null;
  readonly description: string | null;
  readonly technology: string | null;
  readonly tags: readonly string[];
  readonly links: ReturnType<typeof parseLinkEntries>;
}

/**
 * Assembles the tooltip's content from a resolved node plus (when
 * resolvable) the element it points at — `ResolvedDiagramNode` itself
 * already carries title/description/technology/tags, but not `links` (see
 * `@workspec/c4-model`'s `ResolvedDiagramNode`, which does not surface an
 * element's `links` field); the underlying `LoadedElement`, looked up by
 * slug, is where those live.
 */
export function tooltipContentFor(
  node: Pick<ResolvedDiagramNode, 'title' | 'kind' | 'description' | 'technology' | 'tags' | 'slug'>,
  elementsByKindAndSlug: ReadonlyMap<string, LoadedElement> | undefined,
): TooltipContentModel {
  const element =
    node.slug !== null && node.kind !== null ? elementsByKindAndSlug?.get(elementKey(node.kind, node.slug)) : undefined;
  const rawLinks = element?.element.data.links ?? [];
  return {
    title: node.title,
    kind: node.kind,
    description: node.description,
    technology: node.technology,
    tags: node.tags,
    links: parseLinkEntries(rawLinks),
  };
}

export function TooltipContent(props: {
  content: TooltipContentModel;
  linkResolver: LinkResolver;
}): ReactElement {
  const { content, linkResolver } = props;
  return (
    <div className="c4-tooltip-body">
      {content.kind !== null && <div className="c4-tooltip-kind">{content.kind.replace(/-/g, ' ')}</div>}
      <div className="c4-tooltip-title">{content.title}</div>
      {content.description !== null && content.description !== '' && (
        <p className="c4-tooltip-desc">{content.description}</p>
      )}
      {content.technology !== null && content.technology !== '' && (
        <div className="c4-tooltip-tech">{content.technology}</div>
      )}
      {content.tags.length > 0 && (
        <div className="c4-tooltip-tags">
          {content.tags.map((tag) => (
            <span key={tag} className="c4-tooltip-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <LinksBlock links={content.links} resolve={linkResolver} />
    </div>
  );
}
