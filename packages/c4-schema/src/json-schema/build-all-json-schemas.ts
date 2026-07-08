import {
  ACTOR_SCHEMA_URL,
  COMPONENT_SCHEMA_URL,
  CONTAINER_SCHEMA_URL,
  DATABASE_SCHEMA_URL,
  DIAGRAM_SCHEMA_URL,
  DOMAIN_SCHEMA_URL,
  EXTERNAL_SYSTEM_SCHEMA_URL,
  FEATURE_SCHEMA_URL,
  LAYOUT_SCHEMA_URL,
  QUEUE_SCHEMA_URL,
  SPEC_SCHEMA_URL,
  SYSTEM_SCHEMA_URL,
} from '../constants/schema-urls.js';
import { ActorElement } from '../schemas/actor.js';
import { C4Element } from '../schemas/c4-element.js';
import { Diagram } from '../schemas/diagram/diagram.js';
import { DomainElement } from '../schemas/domain.js';
import { ExternalSystemElement } from '../schemas/external-system.js';
import { FeatureElement } from '../schemas/feature.js';
import { Layout } from '../schemas/layout/layout.js';
import { Spec } from '../schemas/spec/spec.js';
import { SystemElement } from '../schemas/system.js';
import { buildJsonSchema } from './build-json-schema.js';

/**
 * Builds every committed C4 JSON Schema, keyed by the filename it's
 * written to under `json-schema/c4/`. `scripts/gen-schema.ts` writes this
 * map to disk; the drift test regenerates it in-memory and asserts
 * byte-equality with what's committed.
 */
export function buildAllJsonSchemas(): Record<string, unknown> {
  return {
    'actor.schema.json': buildJsonSchema(
      ActorElement,
      ACTOR_SCHEMA_URL,
      'WorkSpec C4 Actor (v1alpha1)',
    ),
    'system.schema.json': buildJsonSchema(
      SystemElement,
      SYSTEM_SCHEMA_URL,
      'WorkSpec C4 System (v1alpha1)',
    ),
    'external-system.schema.json': buildJsonSchema(
      ExternalSystemElement,
      EXTERNAL_SYSTEM_SCHEMA_URL,
      'WorkSpec C4 External System (v1alpha1)',
    ),
    'container.schema.json': buildJsonSchema(
      C4Element,
      CONTAINER_SCHEMA_URL,
      'WorkSpec C4 Container (v1alpha1)',
    ),
    'component.schema.json': buildJsonSchema(
      C4Element,
      COMPONENT_SCHEMA_URL,
      'WorkSpec C4 Component (v1alpha1)',
    ),
    'database.schema.json': buildJsonSchema(
      C4Element,
      DATABASE_SCHEMA_URL,
      'WorkSpec C4 Database (v1alpha1)',
    ),
    'queue.schema.json': buildJsonSchema(
      C4Element,
      QUEUE_SCHEMA_URL,
      'WorkSpec C4 Queue (v1alpha1)',
    ),
    'domain.schema.json': buildJsonSchema(
      DomainElement,
      DOMAIN_SCHEMA_URL,
      'WorkSpec C4 Domain (v1alpha1)',
    ),
    'feature.schema.json': buildJsonSchema(
      FeatureElement,
      FEATURE_SCHEMA_URL,
      'WorkSpec C4 Feature (v1alpha1)',
    ),
    'diagram.schema.json': buildJsonSchema(
      Diagram,
      DIAGRAM_SCHEMA_URL,
      'WorkSpec C4 Diagram (v1alpha1)',
    ),
    'layout.schema.json': buildJsonSchema(
      Layout,
      LAYOUT_SCHEMA_URL,
      'WorkSpec C4 Layout (v1alpha1)',
    ),
    'spec.schema.json': buildJsonSchema(Spec, SPEC_SCHEMA_URL, 'WorkSpec C4 Style Spec (v1alpha1)'),
  };
}
