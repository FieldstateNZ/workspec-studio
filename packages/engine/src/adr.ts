// The shared, deterministic ADR renderer — "one renderer, two consumers". The
// studio CLI's `render-adr` writes its Markdown output; S5's ADR view reuses
// `buildAdrModel` to drive a React presentation. Both consume the same
// structured `AdrModel`, so the CLI artifact and the in-app view never diverge.
//
// Everything here is a pure function of `(decision, catalog)` and the engine's
// own costs — no dates, no locale, no invented prose (porting decision P7 keeps
// the recommendation deterministic; the rationale is user-authored). Money uses
// full, stable numbers via a deterministic formatter (P8) — never
// `toLocaleString`, whose output depends on the ambient locale.

import type { Catalog, Decision } from '@workspec/decision-schema';
import { compute } from './cost.js';
import { recommend } from './recommend.js';

/** ADR status, derived from the decision lifecycle. */
export type AdrStatus = 'Proposed' | 'Accepted' | 'Superseded';

/** One option as presented in the ADR's "Considered options" section. */
export interface AdrConsideredOption {
  /** The option id. */
  id: string;
  /** Human-readable option name. */
  name: string;
  /** Short architecture archetype, if authored. */
  archetype: string | undefined;
  /** One-paragraph summary, if authored. */
  summary: string | undefined;
  /** The option's active environments, in decision order. */
  activeEnvs: string[];
  /** Total monthly cost per active environment. */
  perEnv: Record<string, number>;
  /** Annual cost (`monthly * 12`). */
  annual: number;
  /** Whether the option is complete enough to cost (`complete` from the engine). */
  complete: boolean;
  /** True for the chosen (decided) or recommended (proposed) option. */
  chosen: boolean;
}

/** The decision statement: which option, whether decided, and why. */
export interface AdrDecision {
  /** The chosen/recommended option id, or null when none can be recommended. */
  optionId: string | null;
  /** The chosen/recommended option name, or null. */
  optionName: string | null;
  /** True when derived from a recorded outcome; false for a recommend()-driven proposal. */
  decided: boolean;
  /** The authored rationale (decided) or a neutral, derived proposed line. */
  rationale: string;
}

/** A single consequence / trade-off bullet. */
export interface AdrConsequence {
  /** Whether this reads as a strength, a weakness, or a neutral note. */
  kind: 'strength' | 'weakness' | 'note';
  /** The consequence text. */
  text: string;
}

/** An external reference carried through to the ADR's Links section. */
export interface AdrLink {
  /** Link kind, e.g. "deployment". */
  kind: string;
  /** Human-readable label. */
  label: string;
  /** Optional URL / opaque target the host resolves. */
  target: string | undefined;
}

/** The presentation-agnostic ADR model. Both `render-adr` and the UI consume it. */
export interface AdrModel {
  /** The decision id. */
  id: string;
  /** The decision title (ADR heading). */
  title: string;
  /** ADR status derived from the decision lifecycle. */
  status: AdrStatus;
  /** The problem framing. */
  context: string;
  /** ISO 4217 currency for all amounts. */
  currency: string;
  /** Ordered environment ids the options are costed across. */
  environments: string[];
  /** People accountable for the decision, if authored. */
  deciders: string[];
  /** Creation date, if authored. */
  created: string | undefined;
  /** Who decided, if a decided outcome recorded it. */
  decidedBy: string | undefined;
  /** When it was decided, if a decided outcome recorded it. */
  decidedAt: string | undefined;
  /** Every option under comparison, in decision order, with costs. */
  consideredOptions: AdrConsideredOption[];
  /** The decision statement. */
  decision: AdrDecision;
  /** Consequences derived from the winner's criteria + a cost premium/headroom line. */
  consequences: AdrConsequence[];
  /** External references. */
  links: AdrLink[];
}

// ── Deterministic money formatting (P8) ──────────────────────────────────────

/**
 * Format a currency amount with full, stable digits: thousands grouped with
 * commas, a two-decimal fraction only when the (2dp-rounded) value is not whole.
 * Manual grouping — no `toLocaleString`, so output never depends on the ambient
 * locale. `16104 → "$16,104"`, `54336.576 → "$54,336.58"`.
 */
export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const whole = Number.isInteger(abs);
  const fixed = whole ? String(abs) : abs.toFixed(2);
  const [intPart = '0', fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = fracPart === undefined ? grouped : `${grouped}.${fracPart}`;
  return `${negative ? '-' : ''}$${body}`;
}

// ── Model builder ─────────────────────────────────────────────────────────────

function statusOf(status: Decision['metadata']['status']): AdrStatus {
  if (status === 'decided') return 'Accepted';
  if (status === 'superseded') return 'Superseded';
  return 'Proposed';
}

/**
 * Build the structured ADR model from a decision and its catalog.
 *
 * The winner is the recorded `outcome.option` when the decision is decided,
 * otherwise the engine's `recommend()` pick. Consequences come from the winner's
 * criteria scores (≥4 → strength, ≤2 → weakness, each with its authored note if
 * present) plus one cost line: the annual premium over the cheapest option and
 * the headroom recoverable by reserving steady prod, or — when the winner is
 * already cheapest — a "lowest run-rate" note.
 */
export function buildAdrModel(decision: Decision, catalog: Catalog): AdrModel {
  const result = compute(decision, catalog);
  const outcome = decision.spec.outcome;
  const decided = outcome !== undefined;
  const winnerId = decided ? outcome.option : recommend(result, decision);
  const winner =
    winnerId !== null ? (decision.spec.options.find((o) => o.id === winnerId) ?? null) : null;

  const consideredOptions: AdrConsideredOption[] = decision.spec.options.map((option) => {
    const cost = result.byOption[option.id];
    return {
      id: option.id,
      name: option.name,
      archetype: option.archetype,
      summary: option.summary,
      activeEnvs: cost?.activeEnvs ?? [],
      perEnv: cost?.perEnv ?? {},
      annual: cost?.annual ?? 0,
      complete: cost?.complete ?? false,
      chosen: option.id === winnerId,
    };
  });

  let rationale: string;
  if (decided && outcome) {
    rationale = outcome.rationale;
  } else if (winner) {
    rationale =
      `${winner.name} is the proposed option, selected by the engine's weighted ` +
      `recommendation across the considered options. No outcome has been recorded ` +
      `yet — decide to accept it.`;
  } else {
    rationale = 'No option is complete enough to recommend yet.';
  }

  const consequences: AdrConsequence[] = [];
  if (winner) {
    for (const criterion of decision.spec.criteria) {
      const score = winner.scores[criterion.id];
      if (score === undefined) continue;
      if (score.score >= 4) {
        consequences.push({
          kind: 'strength',
          text: score.note ?? `${criterion.label} is a strength.`,
        });
      } else if (score.score <= 2) {
        consequences.push({
          kind: 'weakness',
          text: score.note ?? `${criterion.label} is a known weakness.`,
        });
      }
    }

    const winnerCost = result.byOption[winner.id];
    if (winnerCost) {
      let cheapestAnnual = Infinity;
      for (const option of decision.spec.options) {
        const cost = result.byOption[option.id];
        if (cost?.complete && cost.annual < cheapestAnnual) cheapestAnnual = cost.annual;
      }
      if (cheapestAnnual !== Infinity) {
        const premium = winnerCost.annual - cheapestAnnual;
        if (premium > 0) {
          consequences.push({
            kind: 'weakness',
            text:
              `Run-rate sits ${formatMoney(premium)}/yr above the cheapest option; ` +
              `reserving steady prod recovers about ${formatMoney(winnerCost.headroom * 12)}/yr.`,
          });
        } else {
          consequences.push({
            kind: 'strength',
            text: `Lowest run-rate of the considered options at ${formatMoney(winnerCost.annual)}/yr.`,
          });
        }
      }
    }
  }

  const links: AdrLink[] = (decision.spec.links ?? []).map((link) => ({
    kind: link.kind,
    label: link.label,
    target: link.target,
  }));

  return {
    id: decision.metadata.id,
    title: decision.metadata.title,
    status: statusOf(decision.metadata.status),
    context: decision.spec.context,
    currency: decision.spec.currency,
    environments: decision.spec.environments,
    deciders: decision.metadata.deciders ?? [],
    created: decision.metadata.created,
    decidedBy: outcome?.decidedBy,
    decidedAt: outcome?.decidedAt,
    consideredOptions,
    decision: {
      optionId: winnerId,
      optionName: winner?.name ?? null,
      decided,
      rationale,
    },
    consequences,
    links,
  };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function envCell(option: AdrConsideredOption, env: string): string {
  return option.activeEnvs.includes(env) ? formatMoney(option.perEnv[env] ?? 0) : '—';
}

function titleCase(env: string): string {
  return env.length === 0 ? env : env[0]!.toUpperCase() + env.slice(1);
}

/**
 * Render an {@link AdrModel} as deterministic Markdown. Stable across runs and
 * machines: no timestamps, no locale-sensitive formatting. The considered-options
 * table carries the engine's computed per-env and annual costs.
 */
export function renderAdrMarkdown(model: AdrModel): string {
  const lines: string[] = [];

  lines.push(`# ${model.title}`);
  lines.push('');

  // Front matter as a definition list.
  lines.push(`- **Status:** ${model.status}`);
  lines.push(`- **Decision:** \`${model.id}\``);
  if (model.deciders.length > 0) lines.push(`- **Deciders:** ${model.deciders.join(', ')}`);
  if (model.created !== undefined) lines.push(`- **Created:** ${model.created}`);
  if (model.decidedBy !== undefined) lines.push(`- **Decided by:** ${model.decidedBy}`);
  if (model.decidedAt !== undefined) lines.push(`- **Decided at:** ${model.decidedAt}`);
  lines.push(`- **Currency:** ${model.currency}`);
  lines.push('');

  lines.push('## Context');
  lines.push('');
  lines.push(model.context.trim());
  lines.push('');

  // Considered options — costs table.
  lines.push('## Considered options');
  lines.push('');
  const header = ['Option', ...model.environments.map(titleCase), 'Annual'];
  const align = ['---', ...model.environments.map(() => '---:'), '---:'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${align.join(' | ')} |`);
  for (const option of model.consideredOptions) {
    const marker = option.chosen
      ? model.status === 'Accepted'
        ? ' _(chosen)_'
        : ' _(recommended)_'
      : '';
    const incomplete = option.complete ? '' : ' _(incomplete)_';
    const name = `${option.name}${marker}${incomplete}`;
    const envCells = model.environments.map((env) => envCell(option, env));
    lines.push(`| ${[name, ...envCells, formatMoney(option.annual)].join(' | ')} |`);
  }
  lines.push('');

  // Per-option prose (archetype + summary), preserving the prototype's detail.
  for (const option of model.consideredOptions) {
    const archetype = option.archetype !== undefined ? ` — _${option.archetype}_` : '';
    lines.push(`- **${option.name}**${archetype}`);
    if (option.summary !== undefined && option.summary.trim().length > 0) {
      lines.push(`  ${option.summary.trim().replace(/\s+/g, ' ')}`);
    }
  }
  lines.push('');

  // Decision.
  lines.push('## Decision');
  lines.push('');
  lines.push(model.decision.rationale.trim());
  lines.push('');

  // Consequences & trade-offs.
  lines.push('## Consequences & trade-offs');
  lines.push('');
  if (model.consequences.length === 0) {
    lines.push('_No consequences derived — no option selected yet._');
  } else {
    for (const consequence of model.consequences) {
      const prefix =
        consequence.kind === 'strength'
          ? '**Strength** — '
          : consequence.kind === 'weakness'
            ? '**Weakness** — '
            : '';
      lines.push(`- ${prefix}${consequence.text}`);
    }
  }
  lines.push('');

  // Links.
  if (model.links.length > 0) {
    lines.push('## Links');
    lines.push('');
    for (const link of model.links) {
      const target = link.target !== undefined ? ` (${link.target})` : '';
      lines.push(`- **${link.kind}** — ${link.label}${target}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
