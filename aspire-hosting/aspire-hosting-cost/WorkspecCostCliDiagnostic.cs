namespace Aspire.Hosting;

/// <summary>
/// JSON-deserialization target for the diagnostics array workspec-cost prints on stdout for
/// <c>validate --json</c> (see <c>packages/cost-studio/src/cli.ts</c>'s <c>ValidateDiagnostic</c>
/// for the source shape). Purely internal plumbing — never a parameter or return type of an
/// <c>[AspireExport]</c> member, so it needs no ATS attribute of its own.
/// </summary>
internal sealed record WorkspecCostDiagnostic(
    string Severity,
    string Code,
    string Message,
    string File,
    int? Line = null,
    int? Col = null);
