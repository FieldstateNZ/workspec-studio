import { SYSTEM_ALIAS } from '@workspec/c4-schema';

/** True if `raw` is the `__system__` alias rather than a real element slug. */
export function isSystemAlias(raw: string): boolean {
  return raw === SYSTEM_ALIAS;
}
