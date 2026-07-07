import type { ActorElement } from '../../src/schemas/actor.js';
import type { C4Element } from '../../src/schemas/c4-element.js';
import type { DiagramEdge } from '../../src/schemas/diagram/diagram-edge.js';
import type { ThinDiagramNode } from '../../src/schemas/diagram/diagram-node-thin.js';
import type { ThinDiagram } from '../../src/schemas/diagram/diagram-thin.js';
import type { DomainElement } from '../../src/schemas/domain.js';
import type { ExternalSystemElement } from '../../src/schemas/external-system.js';
import type { FeatureElement } from '../../src/schemas/feature.js';
import type { Layout } from '../../src/schemas/layout/layout.js';
import type { Spec } from '../../src/schemas/spec/spec.js';
import type { SystemElement } from '../../src/schemas/system.js';

/**
 * Test-data factories for `@workspec/c4-schema`. Every test builds its own
 * input via these functions (with per-test overrides) rather than sharing
 * a static fixture object, so tests can't accidentally depend on each
 * other's mutations of the same literal.
 */

export function actorFactory(overrides: Partial<ActorElement> = {}): ActorElement {
  return {
    title: 'Architect',
    description: 'Designs systems and reviews proposed changes.',
    ...overrides,
  };
}

export function externalSystemFactory(overrides: Partial<ExternalSystemElement> = {}): ExternalSystemElement {
  return {
    title: 'Payment Gateway',
    description: 'Third-party processor used to settle invoices.',
    ...overrides,
  };
}

export function systemFactory(overrides: Partial<SystemElement> = {}): SystemElement {
  return {
    title: 'Fieldstate Ledger',
    description: 'Cost tracking and invoicing platform.',
    ...overrides,
  };
}

export function domainFactory(overrides: Partial<DomainElement> = {}): DomainElement {
  return {
    title: 'Billing',
    description: 'Pricing, invoicing, and payment reconciliation.',
    ...overrides,
  };
}

export function featureFactory(overrides: Partial<FeatureElement> = {}): FeatureElement {
  return {
    title: 'Invoice Export',
    description: 'Exports approved invoices as PDF and CSV.',
    ...overrides,
  };
}

export function c4ElementFactory(overrides: Partial<C4Element> = {}): C4Element {
  return {
    type: 'container',
    title: 'API Server',
    description: 'Express API serving the web client.',
    ...overrides,
  };
}

export function diagramEdgeFactory(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    from: 'architect',
    to: '__system__',
    ...overrides,
  };
}

export function bareSlugNodeFactory(overrides: { slug?: string } = {}): ThinDiagramNode {
  return { slug: overrides.slug ?? 'architect' };
}

export function thinDiagramFactory(overrides: Partial<ThinDiagram> = {}): ThinDiagram {
  return {
    title: 'System Context',
    type: 'c4-context',
    nodes: [],
    edges: [],
    ...overrides,
  };
}

export function specFactory(overrides: Partial<Spec> = {}): Spec {
  return {
    type: 'style',
    version: 2,
    elements: {},
    connections: {},
    ...overrides,
  };
}

export function layoutFactory(overrides: Partial<Layout> = {}): Layout {
  return {
    version: 1,
    nodes: {},
    ...overrides,
  };
}
