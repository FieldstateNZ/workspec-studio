import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const files = [
  '.workspec/decisions/aspire-publishing-strategy.yaml',
  'docs/decisions/.workspec/decisions/d1-monorepo-build-tooling.yaml',
  'docs/decisions/.workspec/decisions/d4-catalog-model-scope.yaml',
  'docs/decisions/.workspec/decisions/d5-enterprise-mount-seam.yaml',
  'examples/hosting-platform/.workspec/decisions/hosting-platform.yaml',
  'examples/postgres-managed-vs-self-hosted/.workspec/decisions/postgres-hosting.yaml',
  'packages/decision-schema/test/fixtures/valid/hosting-platform.decision.yaml',
];

const proposed = {
  'hosting-platform': {
    option: 'aks',
    decision: 'Adopt AKS as the leading proposal, pending acceptance.',
    rationale:
      'AKS currently offers the strongest platform fit; this remains proposed until the remaining operational evidence is accepted.',
  },
};

for (const relative of files) {
  const filename = path.join(repositoryRoot, relative);
  const old = YAML.parse(fs.readFileSync(filename, 'utf8'));
  const { spec } = old;
  if (!spec.options) continue;
  const proposal = proposed[old.metadata.slug];
  const chosenId = spec.outcome?.option ?? proposal?.option;
  const chosen = spec.options?.find((option) => option.id === chosenId);
  if (!chosen) throw new Error(`${relative}: cannot determine the selected or proposed option`);

  const nextSpec = {
    title: spec.title,
    status: spec.status === 'decided' ? 'accepted' : 'proposed',
    ...(spec.created ? { created: spec.created } : {}),
    ...(spec.outcome?.decidedAt ? { decided: spec.outcome.decidedAt } : {}),
    ...(spec.outcome?.decidedBy
      ? { deciders: [spec.outcome.decidedBy] }
      : spec.deciders?.length
        ? { deciders: spec.deciders }
        : {}),
    context: spec.context,
    decision: proposal?.decision ?? `Use ${chosen.name}.`,
    rationale: proposal?.rationale ?? spec.outcome?.rationale ?? chosen.summary,
    ...(chosen.summary ? { consequences: [chosen.summary] } : {}),
    alternatives: (spec.options ?? [])
      .filter((option) => option.id !== chosenId)
      .map((option) => ({
        title: option.name,
        ...(option.summary ? { reason: option.summary } : {}),
      })),
    ...(spec.supersedes ? { supersedes: spec.supersedes } : {}),
    ...(spec.links?.length
      ? {
          references: spec.links.map((link) => ({
            kind: link.kind,
            target: link.target ?? link.label,
            ...(link.label ? { label: link.label } : {}),
          })),
        }
      : {}),
    ...(spec.tags?.length ? { tags: spec.tags } : {}),
  };

  const next = {
    apiVersion: old.apiVersion,
    kind: 'Decision',
    metadata: old.metadata,
    spec: nextSpec,
  };
  fs.writeFileSync(
    filename,
    `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/decision.schema.json\n${YAML.stringify(next, { lineWidth: 100 })}`,
  );
}

for (const [source, destination] of [
  [
    'examples/hosting-platform/.workspec/decisions/hosting-platform.yaml',
    'apps/site/src/examples/hosting-platform.decision.yaml',
  ],
  [
    'examples/postgres-managed-vs-self-hosted/.workspec/decisions/postgres-hosting.yaml',
    'apps/site/src/examples/postgres-hosting.decision.yaml',
  ],
]) {
  fs.copyFileSync(path.join(repositoryRoot, source), path.join(repositoryRoot, destination));
}
