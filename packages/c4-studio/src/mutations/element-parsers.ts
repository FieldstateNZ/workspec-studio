import {
  parseActorYaml,
  parseComponentYaml,
  parseContainerYaml,
  parseDatabaseYaml,
  parseDomainYaml,
  parseExternalSystemYaml,
  parseFeatureYaml,
  parseQueueYaml,
  parseSystemYaml,
} from '@workspec/c4-schema';
import type { ParseResult } from '@workspec/c4-schema';
import type { ElementKind } from '@workspec/c4-model';

/** Parses one element file's text against the schema its kind directory implies. */
export type ElementYamlParser = (text: string) => ParseResult<unknown>;

/**
 * One `parse*Yaml` wrapper per element kind — the mutation services'
 * validate-before-write gate. Mirrors `@workspec/c4-model`'s internal
 * `ELEMENT_PARSERS_BY_KIND` (which that package does not export, and this
 * package must not reach into): every write this API performs is parsed
 * back through the exact schema `loadC4Model` will apply on the next
 * reload, so a mutation that would make the loader drop the file is
 * rejected before it touches the tree.
 */
export const ELEMENT_YAML_PARSERS: Record<ElementKind, ElementYamlParser> = {
  actor: parseActorYaml,
  system: parseSystemYaml,
  'external-system': parseExternalSystemYaml,
  container: parseContainerYaml,
  component: parseComponentYaml,
  database: parseDatabaseYaml,
  queue: parseQueueYaml,
  domain: parseDomainYaml,
  feature: parseFeatureYaml,
};
