/**
 * Returns the last `/`-separated segment of a path-shaped string, e.g. an
 * Azure resource ID (`".../subnets/snet-workload"` → `"snet-workload"`).
 * Shared by every adapter that has to recover a short resource name out of a
 * fully-qualified vendor ID (a Terraform `subnet_id`, an ARM `subnet.id`).
 * Returns `undefined` for an empty or trailing-slash-only input.
 */
export function lastPathSegment(path: string): string | undefined {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments.at(-1);
}
