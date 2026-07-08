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
import type { ElementKind } from '../model/element-kind.js';
import type { ElementData } from '../model/element-data.types.js';

/** Parses one element file's text into its kind-tagged {@link ElementData}, or parse issues. */
export type ElementParser = (text: string) => ParseResult<ElementData>;

function tag<K extends ElementKind>(
  kind: K,
  parse: (text: string) => ParseResult<ElementData['data']>,
): ElementParser {
  return (text) => {
    const result = parse(text);
    return result.ok ? { ok: true, data: { kind, data: result.data } as ElementData } : result;
  };
}

/**
 * One `parse*Yaml` wrapper per element kind, each tagging its result with
 * the kind that owns the directory it was discovered under — the loader
 * never has to branch on `data.type` to know an element's kind, since
 * directory placement (not the optional in-file `type:` literal) is what's
 * normative per the Enterprise tree conventions.
 */
export const ELEMENT_PARSERS_BY_KIND: Record<ElementKind, ElementParser> = {
  actor: tag('actor', parseActorYaml),
  system: tag('system', parseSystemYaml),
  'external-system': tag('external-system', parseExternalSystemYaml),
  container: tag('container', parseContainerYaml),
  component: tag('component', parseComponentYaml),
  database: tag('database', parseDatabaseYaml),
  queue: tag('queue', parseQueueYaml),
  domain: tag('domain', parseDomainYaml),
  feature: tag('feature', parseFeatureYaml),
};
