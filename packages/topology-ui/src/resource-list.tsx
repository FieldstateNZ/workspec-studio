// The side panel's default view: every resource that renders as a plain
// NODE in the active lens (the same set `TopologyCanvas` draws as node
// cards — grouping-kind resources of the OTHER lens, e.g. `vnet`/`subnet`
// surfaced as ordinary rows in the resource-group lens), each with its
// glyph, name, vendor type, and placement boundary; clicking selects, same
// as clicking its canvas card. Below it, a legend of every boundary box in
// the active lens. Ported from the design's `resources`/`legend` side-panel
// sections.

import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { LensId, LensTree, ResolvedResource, ResolvedTopology } from '@workspec/topology-model';
import { collectEntries } from './collect-entries.js';
import { Glyph } from './glyph.js';
import { boundaryAccentVar, kindColorVar } from './kind-meta.js';

/** Props for {@link ResourceList}. */
export interface ResourceListProps {
  resolved: ResolvedTopology;
  tree: LensTree;
  lens: LensId;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

function boundaryLabelFor(
  resource: ResolvedResource,
  lens: LensId,
  resolved: ResolvedTopology,
  nameBySlug: ReadonlyMap<string, string>,
): string {
  const parentSlug = lens === 'network' ? resource.network : resource.resourceGroup;
  if (parentSlug === null) return 'external';
  if (lens === 'rg') {
    return resolved.resourceGroupNames.get(parentSlug) ?? nameBySlug.get(parentSlug) ?? parentSlug;
  }
  return nameBySlug.get(parentSlug) ?? parentSlug;
}

export function ResourceList(props: ResourceListProps): ReactElement {
  const { resolved, tree, lens, selectedSlug, onSelect } = props;

  const resourcesBySlug = useMemo(
    () => new Map(resolved.resources.map((resource) => [resource.slug, resource])),
    [resolved],
  );
  const nameBySlug = useMemo(
    () => new Map(resolved.resources.map((resource) => [resource.slug, resource.name])),
    [resolved],
  );
  const { containers, nodes } = useMemo(() => collectEntries(tree.roots), [tree]);

  const legendTitle = lens === 'network' ? 'boundaries' : 'resource groups';

  return (
    <div className="tp-panel-body">
      <div className="tp-panel-intro">
        <span className="tp-panel-eyebrow">Resources</span>
        <p className="tp-panel-copy">
          Declared infrastructure for this environment. Select a resource for its kind, config,
          and the C4 container it realizes.
        </p>
      </div>

      <div className="tp-resource-rows">
        {nodes.map((node) => {
          const resource = resourcesBySlug.get(node.slug);
          if (!resource) return null;
          const accent = kindColorVar(node.kind);
          return (
            <button
              key={node.slug}
              type="button"
              className={
                node.slug === selectedSlug ? 'tp-resource-row tp-resource-row-selected' : 'tp-resource-row'
              }
              onClick={() => onSelect(node.slug)}
            >
              <span
                className="tp-resource-icon"
                style={{ color: accent, background: `color-mix(in oklab, ${accent} 14%, transparent)` }}
              >
                <Glyph kind={node.kind} size={15} />
              </span>
              <span className="tp-resource-text">
                <span className="tp-resource-name">{resource.name}</span>
                <span className="tp-resource-type">{resource.type}</span>
              </span>
              <span className="tp-resource-spacer" />
              <span className="tp-resource-boundary">
                {boundaryLabelFor(resource, lens, resolved, nameBySlug)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="tp-panel-legend">
        <span className="tp-panel-eyebrow">{legendTitle}</span>
        {containers.map((container) => (
          <div key={container.slug} className="tp-legend-row">
            <span className="tp-legend-icon" style={{ color: boundaryAccentVar(container.kind) }}>
              <Glyph kind={container.kind} size={15} />
            </span>
            <span className="tp-legend-label">{container.name}</span>
            <span className="tp-legend-spacer" />
            <span className="tp-legend-meta">{`${container.children.length} resource${container.children.length === 1 ? '' : 's'}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
