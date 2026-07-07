/**
 * Every `links` value must be a repo-relative or package-relative path
 * reference, never a bare string or external URL. `~/` roots at the
 * WorkSpec tree; `@workspace/` roots at a published package. This mirrors
 * Enterprise's `linksField` validation in `lib/yaml-schemas/src/common.ts`.
 */
export const PATH_REF_PATTERN = /^(~\/|@workspace\/)/;
