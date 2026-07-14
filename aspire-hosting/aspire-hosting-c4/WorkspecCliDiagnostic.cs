namespace Aspire.Hosting;

/// <summary>
/// JSON-deserialization target for the diagnostics array workspec-c4 prints on stdout for
/// <c>validate --json</c> and <c>import-aspire --mode check --json</c> (see
/// <c>packages/c4-studio/src/aspire/diagnostics.ts</c>'s <c>AspireDiagnostic</c> for the source shape).
/// Purely internal plumbing — never a parameter or return type of an <c>[AspireExport]</c> member, so
/// it needs no ATS attribute of its own.
/// </summary>
internal sealed record WorkspecCliDiagnostic(
    string Severity,
    string Code,
    string Message,
    string File,
    string? Slug = null,
    int? Line = null,
    int? Col = null);
