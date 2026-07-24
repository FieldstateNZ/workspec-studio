import type { Environment, Resource } from '@workspec/topology-schema';
import {
  createMemorySource,
  loadTopologyModel,
  resolve,
  type ResolvedTopology,
  type TopologyModel,
} from '@workspec/topology-model';
import { readWebAppFixtureSeed } from './read-web-app-fixture.js';

function toResourceMap(model: TopologyModel): ReadonlyMap<string, Resource> {
  return new Map([...model.resources].map(([slug, loaded]) => [slug, loaded.resource]));
}

function toEnvironmentMap(model: TopologyModel): ReadonlyMap<string, Environment> {
  return new Map([...model.environments].map(([slug, loaded]) => [slug, loaded.environment]));
}

/**
 * Loads `@workspec/topology-schema`'s "web-app" fixture through
 * `@workspec/topology-model`'s real `loadTopologyModel` + `resolve()`
 * pipeline and returns the `ResolvedTopology` for `envSlug` — the same
 * normative contract this package's `computeTopologyCost` takes, exercised
 * end to end rather than hand-built. Throws if the fixture tree does not
 * load a singleton topology (it always should; a thrown error here means the
 * fixture itself broke, not this package's code).
 */
export async function loadResolvedWebApp(envSlug: string): Promise<ResolvedTopology> {
  const model = await loadTopologyModel(createMemorySource(await readWebAppFixtureSeed()));
  if (!model.topology) {
    throw new Error('expected the web-app fixture tree to load a singleton topology');
  }
  return resolve(model.topology.topology, toResourceMap(model), toEnvironmentMap(model), envSlug);
}
