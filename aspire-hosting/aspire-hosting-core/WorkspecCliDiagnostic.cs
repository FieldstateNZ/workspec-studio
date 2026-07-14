namespace Aspire.Hosting.Workspec;

/// <summary>
/// JSON-deserialization target for the diagnostics array a workspec module CLI (<c>workspec-c4</c>,
/// <c>workspec-decisions</c>, <c>workspec-cost</c>) prints on stdout for <c>validate --json</c> (and,
/// for workspec-c4, <c>import-aspire --mode check --json</c> — see
/// <c>packages/c4-studio/src/aspire/diagnostics.ts</c>'s <c>AspireDiagnostic</c>). This is the one
/// canonical shape shared by every module integration in this repo (promoted here from three
/// byte-identical private copies — A6, <see href="https://github.com/FieldstateNZ/workspec-studio/issues/39">#39</see>):
/// <c>Slug</c> is only ever populated by workspec-c4's diagnostics (see
/// <c>packages/c4-studio/src/cli.ts</c>'s <c>ValidateDiagnostic</c> vs. workspec-decisions'/
/// workspec-cost's own, which never emit it) — case-insensitive JSON deserialization simply leaves it
/// <see langword="null"/> for CLIs that don't emit the property.
/// </summary>
public sealed record WorkspecCliDiagnostic(
    string Severity,
    string Code,
    string Message,
    string File,
    string? Slug = null,
    int? Line = null,
    int? Col = null);
