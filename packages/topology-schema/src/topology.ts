import { z } from 'zod';
import { defineArtifact, Slug } from '@workspec/schema-core';

// ── Topology kind (`.workspec/topologies/<slug>.yaml`) ──────────────────────
// A Topology is the declared connection graph over a set of Resources,
// scoped to a set of Environments. Built on `@workspec/schema-core`'s
// `defineArtifact`.
//
// Connections are DECLARED edges only — there is no flow/traffic-direction
// concept in v0. `class` distinguishes primary (request-path) edges from
// telemetry (observability) edges; nothing else.

/** A declared edge between two resources. */
export const Connection = z
  .object({
    from: Slug.describe('Bare-slug intra-tree ref → resources/*: the edge source resource.'),
    to: Slug.describe('Bare-slug intra-tree ref → resources/*: the edge target resource.'),
    class: z
      .enum(['primary', 'telemetry'])
      .default('primary')
      .describe(
        'Edge class: "primary" for request-path connections, "telemetry" for observability ' +
          'edges (e.g. a resource shipping metrics to a monitor). Defaults to "primary".',
      ),
    environments: z
      .array(Slug)
      .optional()
      .describe(
        'Subset of the topology environments this connection is active in. Omitted means ' +
          "active in all of the topology's environments.",
      ),
  })
  .describe('A declared edge between two resources.');

/**
 * The Topology body: title, provider, the environments it spans, the
 * default environment shown first, an optional priced catalog, and the
 * declared connection graph.
 */
export const TopologySpec = z
  .object({
    title: z.string().min(1).describe('Topology title.'),
    provider: z.string().min(1).describe('Cloud provider, e.g. "azure", "aws", "gcp".'),
    environments: z
      .array(Slug)
      .min(1)
      .describe(
        'Bare-slug intra-tree refs → environments/*: the environments this topology spans.',
      ),
    defaultEnvironment: Slug.describe(
      'The environment shown by default; must be one of `environments`.',
    ),
    catalog: Slug.optional().describe(
      'Bare-slug intra-tree ref → decisions/catalogs/*: the decision catalog resource costs ' +
        'in this topology price against.',
    ),
    connections: z
      .array(Connection)
      .describe('The declared connection graph. May be empty for a topology with no edges yet.'),
  })
  .describe('The topology body.');

/**
 * A `.workspec/topologies/<slug>.yaml` artifact.
 *
 * Cross-field integrity is enforced by `superRefine`: `defaultEnvironment`
 * must be one of `environments`, and every connection's own `environments`
 * subset must be drawn from the topology's `environments`. Resource refs
 * (`connections[].from`/`.to`) are cross-artifact slug refs — resolving them
 * is a `verify`-time host concern, not a schema error (same convention as
 * `@workspec/decision-schema`'s `catalog`/`supersedes`).
 */
export const TopologyArtifact = defineArtifact('Topology', TopologySpec)
  .superRefine((doc, ctx) => {
    const envs = new Set(doc.spec.environments);

    if (!envs.has(doc.spec.defaultEnvironment)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spec', 'defaultEnvironment'],
        message: `unknown environment "${doc.spec.defaultEnvironment}" (not declared in spec.environments)`,
      });
    }

    doc.spec.connections.forEach((connection, ci) => {
      connection.environments?.forEach((env, ei) => {
        if (!envs.has(env)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'connections', ci, 'environments', ei],
            message: `unknown environment "${env}" (not declared in spec.environments)`,
          });
        }
      });
    });
  })
  .describe('A WorkSpec topology artifact.');

// Inferred TypeScript types (Zod is the single source of truth).
export type Connection = z.infer<typeof Connection>;
export type TopologySpec = z.infer<typeof TopologySpec>;
export type Topology = z.infer<typeof TopologyArtifact>;
