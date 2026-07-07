// Pure, immutable edit helpers for a working-copy decision. The workspace keeps
// a local draft (so lever toggles and line edits reprice instantly) and persists
// each change through the port. These helpers never mutate their input; every
// edit returns a new decision, so the engine recomputes from a fresh object.

import type { Decision, Line, Option } from '@workspec/decision-schema';

function mapOption(decision: Decision, optionId: string, fn: (option: Option) => Option): Decision {
  return {
    ...decision,
    spec: {
      ...decision.spec,
      options: decision.spec.options.map((o) => (o.id === optionId ? fn(o) : o)),
    },
  };
}

function mapLine(option: Option, lineId: string, fn: (line: Line) => Line): Option {
  return { ...option, lines: option.lines.map((l) => (l.id === lineId ? fn(l) : l)) };
}

/** Toggle a lever's `enabled` flag. */
export function toggleLever(decision: Decision, optionId: string, leverId: string): Decision {
  return mapOption(decision, optionId, (option) => ({
    ...option,
    levers: (option.levers ?? []).map((lever) =>
      lever.id === leverId ? { ...lever, enabled: !lever.enabled } : lever,
    ),
  }));
}

/** Set a metered SKU line's `sku`, `mode`, or `schedule`. */
export function setLineField(
  decision: Decision,
  optionId: string,
  lineId: string,
  patch: Partial<Pick<Extract<Line, { flat: false }>, 'sku' | 'mode' | 'schedule'>>,
): Decision {
  return mapOption(decision, optionId, (option) =>
    mapLine(option, lineId, (line) => (line.flat ? line : { ...line, ...patch })),
  );
}

/** Set the per-env quantity of a SKU line. */
export function setLineQty(
  decision: Decision,
  optionId: string,
  lineId: string,
  env: string,
  qty: number,
): Decision {
  return mapOption(decision, optionId, (option) =>
    mapLine(option, lineId, (line) =>
      line.flat ? line : { ...line, qty: { ...line.qty, [env]: qty } },
    ),
  );
}

/** Set the per-env amount of a flat line. */
export function setLineAmount(
  decision: Decision,
  optionId: string,
  lineId: string,
  env: string,
  amount: number,
): Decision {
  return mapOption(decision, optionId, (option) =>
    mapLine(option, lineId, (line) =>
      line.flat ? { ...line, amount: { ...line.amount, [env]: amount } } : line,
    ),
  );
}

/** Add or remove an environment from an option (kept a subset of the decision). */
export function toggleOptionEnv(decision: Decision, optionId: string, env: string): Decision {
  return mapOption(decision, optionId, (option) => {
    const has = option.environments.includes(env);
    const environments = has
      ? option.environments.filter((e) => e !== env)
      : decision.spec.environments.filter((e) => option.environments.includes(e) || e === env);
    return { ...option, environments };
  });
}

/** Set a criterion score for an option. */
export function setScore(
  decision: Decision,
  optionId: string,
  criterionId: string,
  score: number,
): Decision {
  return mapOption(decision, optionId, (option) => ({
    ...option,
    scores: {
      ...option.scores,
      [criterionId]: { ...(option.scores[criterionId] ?? { score: 0 }), score },
    },
  }));
}
