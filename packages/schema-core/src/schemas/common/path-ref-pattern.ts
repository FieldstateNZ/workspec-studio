/**
 * Every `links` value must be a repo-relative or package-relative path
 * reference, never a bare string or external URL. `~/` roots at the
 * WorkSpec tree; `@workspace/` roots at a published package. Same shape as
 * `@workspec/c4-schema`'s `PATH_REF_PATTERN` — copied rather than imported
 * so this package has zero `@workspec` dependencies.
 */
export const PATH_REF_PATTERN = /^(~\/|@workspace\/)/;
