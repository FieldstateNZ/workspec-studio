namespace Aspire.Hosting;

// TODO(A6, #39): consolidate with the near-identical WorkspecCliDiagnostic in aspire-hosting-c4 into
// Core once both integrations' diagnostic shapes are reconciled — see WorkspecDecisionsCliRunner's
// own TODO for the matching runner-side duplication.

/// <summary>
/// JSON-deserialization target for the diagnostics array <c>workspec-decisions</c> prints on stdout
/// for <c>validate --json</c> (see <c>packages/decision-studio/src/cli.ts</c>'s
/// <c>ValidateDiagnostic</c> for the source shape). Unlike aspire-hosting-c4's
/// <c>WorkspecCliDiagnostic</c>, decisions diagnostics never carry a <c>slug</c> — only an optional
/// source <c>line</c>/<c>col</c>. Purely internal plumbing — never a parameter or return type of an
/// <c>[AspireExport]</c> member, so it needs no ATS attribute of its own.
/// </summary>
internal sealed record WorkspecDecisionsCliDiagnostic(
    string Severity,
    string Code,
    string Message,
    string File,
    int? Line = null,
    int? Col = null);
