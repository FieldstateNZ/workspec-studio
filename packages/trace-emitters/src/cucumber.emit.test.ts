import { describe, expect, it } from 'vitest';
import type { SystemRequirement } from '@workspec/req-schema';
import { cucumberEmitter } from './cucumber.js';
import type { SysReqInput } from './types.js';

function sysReqInput(slug: string, spec: SystemRequirement['spec']): SysReqInput {
  return {
    slug,
    sysreq: {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'SystemRequirement',
      metadata: { slug },
      spec,
    },
  };
}

const persists = sysReqInput('inline-create-persists', {
  title: 'Creating an element inline saves it immediately',
  feature: 'element-authoring',
  userReqs: ['authoring-flow'],
  given: ['a canvas with no selected element'],
  when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
  then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
});

const eachKind = sysReqInput('inline-create-each-kind', {
  title: 'Inline create works for each element kind',
  feature: 'element-authoring',
  userReqs: ['authoring-flow'],
  given: ['a canvas'],
  when: ['the dev lead inline-creates a "<kind>"'],
  then: ['a valid "<kind>" artifact is written'],
  examples: [{ kind: 'component' }, { kind: 'container' }, { kind: 'database' }],
});

describe('cucumberEmitter.emit', () => {
  it('emits one .feature file per sysreq, named on the slug (feature-file-per-sysreq)', () => {
    const files = cucumberEmitter.emit([persists, eachKind]);
    expect(files.map((f) => f.path)).toEqual([
      'inline-create-each-kind.feature',
      'inline-create-persists.feature',
    ]);
  });

  it('returns files deterministically sorted by path regardless of input order', () => {
    const a = cucumberEmitter.emit([persists, eachKind]);
    const b = cucumberEmitter.emit([eachKind, persists]);
    expect(a).toEqual(b);
  });

  it('tags each scenario with @<slug> (req-tag-on-scenario — the ingest binding)', () => {
    for (const input of [persists, eachKind]) {
      const [file] = cucumberEmitter.emit([input]);
      expect(file?.content).toContain(`@${input.slug}\n`);
    }
  });

  it('uses Scenario Outline only when the sysreq has an examples table (outline-from-examples)', () => {
    const [plain] = cucumberEmitter.emit([persists]);
    const [outline] = cucumberEmitter.emit([eachKind]);
    expect(plain?.content).toContain('  Scenario: ');
    expect(plain?.content).not.toContain('Scenario Outline');
    expect(outline?.content).toContain('  Scenario Outline: ');
    expect(outline?.content).toContain('    Examples:');
  });

  it('byte-stable full output for a plain scenario', () => {
    const [file] = cucumberEmitter.emit([persists]);
    expect(file?.content).toMatchInlineSnapshot(`
      "Feature: element-authoring

        @inline-create-persists
        Scenario: Creating an element inline saves it immediately
          Given a canvas with no selected element
          When the dev lead double-clicks empty canvas
          And types a name and presses Enter
          Then the element is persisted
          And appears in the repo tree without a form submit
      "
    `);
  });

  it('byte-stable full output for a scenario outline', () => {
    const [file] = cucumberEmitter.emit([eachKind]);
    expect(file?.content).toMatchInlineSnapshot(`
      "Feature: element-authoring

        @inline-create-each-kind
        Scenario Outline: Inline create works for each element kind
          Given a canvas
          When the dev lead inline-creates a "<kind>"
          Then a valid "<kind>" artifact is written

          Examples:
            | kind      |
            | component |
            | container |
            | database  |
      "
    `);
  });
});
