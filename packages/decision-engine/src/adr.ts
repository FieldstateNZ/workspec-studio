import type { Decision } from '@workspec/decision-schema';

/** Presentation model for one repository-native Decision record. */
export interface AdrModel {
  slug: string;
  decision: Decision;
}

export function buildAdrModel(
  decision: Decision,
  slug = decision.metadata.slug ?? 'decision',
): AdrModel {
  return { slug, decision };
}

function heading(lines: string[], title: string, body: string | undefined): void {
  if (body === undefined) return;
  lines.push(`## ${title}`, '', body.trim(), '');
}

/** Deterministic Markdown projection of a Decision. No catalog or analysis engine involved. */
export function renderAdrMarkdown(model: AdrModel): string {
  const { spec } = model.decision;
  const lines = [
    `# ${spec.title}`,
    '',
    `- **Status:** ${spec.status}`,
    `- **Decision:** \`${model.slug}\``,
  ];
  if (spec.created !== undefined) lines.push(`- **Created:** ${spec.created}`);
  if (spec.decided !== undefined) lines.push(`- **Decided:** ${spec.decided}`);
  if (spec.deciders?.length) lines.push(`- **Deciders:** ${spec.deciders.join(', ')}`);
  if (spec.supersedes !== undefined) lines.push(`- **Supersedes:** \`${spec.supersedes}\``);
  lines.push('');
  heading(lines, 'Context', spec.context);
  heading(lines, 'Decision', spec.decision);
  heading(lines, 'Rationale', spec.rationale);
  if (spec.consequences !== undefined) {
    lines.push('## Consequences', '', ...spec.consequences.map((item) => `- ${item}`), '');
  }
  if (spec.alternatives !== undefined) {
    lines.push('## Alternatives considered', '');
    for (const alternative of spec.alternatives) {
      lines.push(
        `- **${alternative.title}**${alternative.reason ? ` — ${alternative.reason}` : ''}`,
      );
    }
    lines.push('');
  }
  if (spec.links !== undefined) {
    lines.push('## Links', '');
    for (const link of spec.links) {
      const key = Object.keys(link).find((candidate) => candidate !== 'cardinality');
      if (key !== undefined) lines.push(`- **${key}** — ${String(link[key])}`);
    }
    lines.push('');
  }
  if (spec.references !== undefined) {
    lines.push('## References', '');
    for (const reference of spec.references) {
      lines.push(
        `- **${reference.kind}** — ${reference.label ?? reference.target} (${reference.target})`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
