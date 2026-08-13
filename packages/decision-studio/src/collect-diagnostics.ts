import { readFile } from 'node:fs/promises';
import { parseDecisionYaml } from '@workspec/decision-schema';
import type { FsRepository } from './fs-repository.js';

export interface ValidateDiagnostic {
  readonly severity: 'error';
  readonly code: 'parse-error' | 'dangling-supersedes';
  readonly file: string;
  readonly path?: string;
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
}

/** Validate every core Decision and verify authored supersession refs. */
export async function collectDiagnostics(repo: FsRepository): Promise<ValidateDiagnostic[]> {
  const diagnostics: ValidateDiagnostic[] = [];
  const refs = await repo.listDecisions();
  const slugs = new Set(refs.map((entry) => entry.slug));
  for (const entry of refs) {
    const parsed = parseDecisionYaml(await readFile(repo.resolve(entry.ref), 'utf8'));
    if (!parsed.ok) {
      diagnostics.push(
        ...parsed.errors.map((issue) => ({
          severity: 'error' as const,
          code: 'parse-error' as const,
          file: entry.ref,
          message: issue.message,
          line: issue.line,
          col: issue.col,
          ...(issue.path.length > 0 ? { path: issue.path } : {}),
        })),
      );
      continue;
    }
    const supersedes = parsed.data.spec.supersedes;
    if (supersedes !== undefined && !slugs.has(supersedes)) {
      diagnostics.push({
        severity: 'error',
        code: 'dangling-supersedes',
        file: entry.ref,
        path: 'spec.supersedes',
        message: `unknown decision "${supersedes}"`,
        line: 1,
        col: 1,
      });
    }
  }
  return diagnostics;
}
