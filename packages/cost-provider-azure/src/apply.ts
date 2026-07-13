import { TagPlanArtifact } from '@workspec/cost-schema';
import type { ApplyEntryResult, ApplyResult } from '@workspec/cost-provider';
import type { TagPlan, TagPlanEntryType } from '@workspec/cost-schema';
import type { AzureHttp } from './http.js';

// ── Apply via ARM "Tags - Update At Scope" ──────────────────────────────────
// One PATCH per resource per operation kind: adds+changes are grouped into a
// single `Merge` PATCH (ARM merges the given tags into whatever's already
// there — untouched tags on the resource are left alone), and removes into a
// single `Delete` PATCH. `noop` entries are never sent. A failure on one
// resource (or one operation kind for a resource) doesn't stop the others —
// each PATCH's result is attributed back to exactly the entries it covers.
//
// `plan` is Zod-revalidated on the way in, BEFORE any request is issued —
// mirrors `@workspec/cost-provider`'s memory double (`memory.ts`'s
// `applyTags`), and for the same reason: a hand-edited, structurally
// inconsistent TagPlan (e.g. an `add` entry with `desired: null`, or a
// duplicate resourceId/tag entry) must be rejected all-or-nothing, never
// discovered mid-loop after earlier resources have already been PATCHed live.

const TAGS_API_VERSION = '2024-11-01';

/** Mirrors `@workspec/cost-provider`'s memory double's own `firstIssue` — keep the two rejection messages consistent. */
function firstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || '<root>'}: ${issue.message}` : 'invalid';
}

function tagsUrl(resourceId: string): string {
  return `https://management.azure.com${resourceId}/providers/Microsoft.Resources/tags/default?api-version=${TAGS_API_VERSION}`;
}

function nonNullDesired(entry: TagPlanEntryType): string {
  if (entry.desired === null) {
    // Unreachable: TagPlanArtifact's superRefine guarantees `desired` is
    // non-null whenever `action` is 'add' or 'change'.
    throw new Error(`applyAzureTags: entry for "${entry.resourceId}"/"${entry.tag}" has action "${entry.action}" but desired is null`);
  }
  return entry.desired;
}

function nonNullCurrent(entry: TagPlanEntryType): string {
  if (entry.current === null) {
    // Unreachable: TagPlanArtifact's superRefine guarantees `current` is
    // non-null whenever `action` is 'remove'.
    throw new Error(`applyAzureTags: entry for "${entry.resourceId}"/"${entry.tag}" has action "${entry.action}" but current is null`);
  }
  return entry.current;
}

interface ResourceGroup {
  resourceId: string;
  mergeEntries: TagPlanEntryType[];
  removeEntries: TagPlanEntryType[];
  noopEntries: TagPlanEntryType[];
}

function groupByResource(entries: readonly TagPlanEntryType[]): ResourceGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ResourceGroup>();

  for (const entry of entries) {
    let group = groups.get(entry.resourceId);
    if (group === undefined) {
      group = { resourceId: entry.resourceId, mergeEntries: [], removeEntries: [], noopEntries: [] };
      groups.set(entry.resourceId, group);
      order.push(entry.resourceId);
    }
    if (entry.action === 'noop') {
      group.noopEntries.push(entry);
    } else if (entry.action === 'remove') {
      group.removeEntries.push(entry);
    } else {
      group.mergeEntries.push(entry);
    }
  }

  return order.map((resourceId) => {
    const group = groups.get(resourceId);
    if (group === undefined) {
      // Unreachable: `order` is only ever populated alongside `groups`.
      throw new Error(`applyAzureTags: internal error grouping entries for "${resourceId}"`);
    }
    return group;
  });
}

export interface ApplyAzureTagsOptions {
  http: AzureHttp;
  dryRun?: boolean;
}

/**
 * Apply (or, when `dryRun`, only simulate) a TagPlan's actions via Azure
 * Resource Manager's "Tags - Update At Scope" operation. Continues past a
 * per-resource (or per-operation-kind) failure so one bad resource doesn't
 * abort the whole plan.
 *
 * `plan` is re-validated against {@link TagPlanArtifact} first; an invalid
 * plan is rejected before any HTTP request is made (all-or-nothing — no
 * partial live mutation from a plan that was already inconsistent).
 */
export async function applyAzureTags(plan: TagPlan, options: ApplyAzureTagsOptions): Promise<ApplyResult> {
  const planResult = TagPlanArtifact.safeParse(plan);
  if (!planResult.success) {
    throw new Error(`applyAzureTags: invalid TagPlan (${firstIssue(planResult.error)})`);
  }
  const validPlan = planResult.data;

  const { http, dryRun = false } = options;
  const groups = groupByResource(validPlan.spec.entries);

  // Keyed by "resourceId\u0000tag" (NUL separator: cannot occur in either
  // field — same convention TagPlanArtifact's own superRefine uses for its
  // duplicate-entry check). Filled in per-resource-group below, then
  // flattened back into `plan.spec.entries`' own order at the end, so
  // `results[]` honors the port's documented contract ("one result per
  // TagPlan entry, in the plan's entries[] order") regardless of the
  // per-resource/per-operation-kind batching this function does internally.
  const outcomes = new Map<string, ApplyEntryResult>();
  let applied = 0;
  let failed = 0;
  let skippedNoop = 0;

  function recordSkippedNoop(entries: readonly TagPlanEntryType[]): void {
    for (const entry of entries) {
      outcomes.set(`${entry.resourceId}\u0000${entry.tag}`, {
        resourceId: entry.resourceId,
        tag: entry.tag,
        action: entry.action,
        ok: true,
      });
      skippedNoop += 1;
    }
  }

  function recordOutcome(entries: readonly TagPlanEntryType[], ok: boolean, error?: string): void {
    for (const entry of entries) {
      outcomes.set(`${entry.resourceId}\u0000${entry.tag}`, {
        resourceId: entry.resourceId,
        tag: entry.tag,
        action: entry.action,
        ok,
        ...(error !== undefined ? { error } : {}),
      });
      if (ok) {
        applied += 1;
      } else {
        failed += 1;
      }
    }
  }

  for (const group of groups) {
    recordSkippedNoop(group.noopEntries);

    if (group.mergeEntries.length > 0) {
      if (dryRun) {
        recordOutcome(group.mergeEntries, true);
      } else {
        const tags: Record<string, string> = {};
        for (const entry of group.mergeEntries) {
          tags[entry.tag] = nonNullDesired(entry);
        }
        try {
          const res = await http.request({
            method: 'PATCH',
            url: tagsUrl(group.resourceId),
            body: { operation: 'Merge', properties: { tags } },
          });
          if (res.status >= 200 && res.status < 300) {
            recordOutcome(group.mergeEntries, true);
          } else {
            recordOutcome(group.mergeEntries, false, `HTTP ${res.status}`);
          }
        } catch (error) {
          recordOutcome(group.mergeEntries, false, error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (group.removeEntries.length > 0) {
      if (dryRun) {
        recordOutcome(group.removeEntries, true);
      } else {
        const tags: Record<string, string> = {};
        for (const entry of group.removeEntries) {
          tags[entry.tag] = nonNullCurrent(entry);
        }
        try {
          const res = await http.request({
            method: 'PATCH',
            url: tagsUrl(group.resourceId),
            body: { operation: 'Delete', properties: { tags } },
          });
          if (res.status >= 200 && res.status < 300) {
            recordOutcome(group.removeEntries, true);
          } else {
            recordOutcome(group.removeEntries, false, `HTTP ${res.status}`);
          }
        } catch (error) {
          recordOutcome(group.removeEntries, false, error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  const results = validPlan.spec.entries.map((entry): ApplyEntryResult => {
    const outcome = outcomes.get(`${entry.resourceId}\u0000${entry.tag}`);
    if (outcome === undefined) {
      // Unreachable: every entry is placed into exactly one of
      // noop/merge/remove above, and every one of those groups is recorded.
      throw new Error(`applyAzureTags: internal error — no outcome recorded for "${entry.resourceId}"/"${entry.tag}"`);
    }
    return outcome;
  });

  return { results, applied, failed, skippedNoop, dryRun };
}
