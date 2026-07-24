import type { TopologyDiagnostic } from '@workspec/topology-model';

/**
 * Formats one `TopologyDiagnostic` as a `file:line:col: severity: message`
 * line, mirroring `@workspec/decision-studio`'s/`@workspec/cost-studio`'s CLI
 * diagnostic line shape. `file` is `''` for the file-count codes
 * (`no-topology`/`multiple-topologies`) that name no single file — printed as
 * `<tree>` so the line still reads sensibly. `line`/`col` default to `1:1`
 * when the diagnostic doesn't carry a location.
 */
export function formatDiagnostic(diagnostic: TopologyDiagnostic): string {
  const file = diagnostic.file.length > 0 ? diagnostic.file : '<tree>';
  const line = diagnostic.line ?? 1;
  const col = diagnostic.col ?? 1;
  return `${file}:${line}:${col}: ${diagnostic.severity}: ${diagnostic.message}\n`;
}
