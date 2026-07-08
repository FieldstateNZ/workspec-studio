import type {
  ActorElement,
  C4Element,
  DomainElement,
  ExternalSystemElement,
  FeatureElement,
  SystemElement,
} from '@workspec/c4-schema';

/**
 * A parsed element's kind, discriminating which of `@workspec/c4-schema`'s
 * per-kind types `data` holds. `container`/`component`/`database`/`queue`
 * share one schema (`C4Element`) upstream, so they share one union member
 * here too — same asymmetry `@workspec/c4-schema` documents.
 */
export type ElementData =
  | { readonly kind: 'actor'; readonly data: ActorElement }
  | { readonly kind: 'system'; readonly data: SystemElement }
  | { readonly kind: 'external-system'; readonly data: ExternalSystemElement }
  | { readonly kind: 'domain'; readonly data: DomainElement }
  | { readonly kind: 'feature'; readonly data: FeatureElement }
  | { readonly kind: 'container' | 'component' | 'database' | 'queue'; readonly data: C4Element };

/** One successfully parsed element file: its path, filename-derived slug, and typed data. */
export interface LoadedElement {
  readonly slug: string;
  readonly path: string;
  readonly element: ElementData;
}
