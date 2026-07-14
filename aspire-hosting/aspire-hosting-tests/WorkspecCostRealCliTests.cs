using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// The ONE test class in this slice that needs the real <c>@workspec/cost-studio</c> CLI
/// (<c>packages/cost-studio/dist/bin.js</c>, built via <c>pnpm --filter @workspec/cost-studio...
/// build</c>) — every other cost test in this project uses no CLI at all or a committed fake-CLI
/// fixture script. Mirrors <c>WorkspecC4E2ETests</c>' skip-with-message pattern: unlike C4/decisions,
/// <c>.github/workflows/ci.yml</c> does NOT build <c>packages/cost-studio</c> this round (A5's scope
/// explicitly leaves the only CI edit to A4 — a future slice wires the cost-studio build step), so
/// this test self-skips in CI and everywhere else the JS package isn't built, rather than failing.
/// </summary>
/// <remarks>
/// Deliberately lighter-weight than <c>WorkspecC4E2ETests</c>: this only needs to prove the real CLI
/// round-trips through <see cref="WorkspecCostCliRunner.RunAsync"/> against a real artifact
/// directory — it doesn't need a running app, DCP, or an HTTP server (workspec-cost has no serve
/// mode to boot), so it calls the runner directly rather than going through
/// <c>DistributedApplicationTestingBuilder</c>.
/// </remarks>
public class WorkspecCostRealCliTests
{
    [Fact]
    public async Task Validate_AgainstRealCli_ReturnsCleanExitAndEmptyDiagnostics()
    {
        var cliPath = FindBuiltCliPath();
        if (cliPath is null)
        {
            // Skip-with-message rather than fail: dotnet test must stay runnable standalone
            // without a JS toolchain. This round's CI does not build packages/cost-studio (A4 owns
            // the only CI edit this round; a later slice wires this build step) — see this class's
            // <remarks>.
            Console.WriteLine(
                "SKIP WorkspecCostRealCliTests: packages/cost-studio/dist/bin.js not found under the repo root. " +
                "Run `pnpm --filter @workspec/cost-studio... build` first to exercise this test for real.");
            return;
        }

        var fixtureDir = Path.Combine(AppContext.BaseDirectory, "Fixtures", "cost-validate-fixture");
        Assert.True(Directory.Exists(fixtureDir), $"Expected the cost-validate-fixture directory at '{fixtureDir}'.");

        var result = await WorkspecCostCliRunner.RunAsync(
            new WorkspecCliInvocation(cliPath),
            ["validate", "--json", "--dir", fixtureDir],
            AppContext.BaseDirectory,
            CancellationToken.None);

        Assert.True(
            result.ExitCode is 0 or 1,
            $"Expected `validate --json` to exit 0 or 1. Exit code: {result.ExitCode}. Stderr: {result.Stderr}");

        var diagnostics = WorkspecCostCliRunner.ParseDiagnostics(result.Stdout);

        // The fixture is a single known-valid Inventory artifact with no attribution present, so
        // schema validation is the only thing that runs — it must be clean.
        Assert.Equal(0, result.ExitCode);
        Assert.Empty(diagnostics);
    }

    // Walks up from the test assembly's own output directory looking for pnpm-workspace.yaml — a
    // reliable, unique repo-root marker. Mirrors WorkspecC4E2ETests' own FindRepoRoot exactly.
    private static string? FindBuiltCliPath()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null)
        {
            return null;
        }

        var cliPath = Path.Combine(repoRoot, "packages", "cost-studio", "dist", "bin.js");
        return File.Exists(cliPath) ? cliPath : null;
    }

    private static string? FindRepoRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "pnpm-workspace.yaml")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
