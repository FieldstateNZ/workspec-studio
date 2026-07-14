using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// The ONE test class in this slice that needs the real <c>@workspec/cost-studio</c> CLI
/// (<c>packages/cost-studio/dist/bin.js</c>, built via <c>pnpm --filter @workspec/cost-studio...
/// build</c>) — every other cost test in this project uses no CLI at all or a committed fake-CLI
/// fixture script. Mirrors <c>WorkspecC4E2ETests</c>' skip-with-message pattern:
/// <c>.github/workflows/ci.yml</c>'s dotnet job now builds <c>packages/cost-studio</c> alongside
/// <c>c4-studio</c>/<c>decision-studio</c> before running <c>dotnet test</c> (A6, #39), so this
/// test runs for real in CI rather than self-skipping — the self-skip path only fires locally, or
/// anywhere else the JS package hasn't been built.
/// </summary>
/// <remarks>
/// Deliberately lighter-weight than <c>WorkspecC4E2ETests</c>: this only needs to prove the real CLI
/// round-trips through <see cref="WorkspecCliRunner.RunAsync"/> against a real artifact
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
            // without a JS toolchain having built packages/cost-studio locally. CI itself always
            // builds it first (ci.yml's dotnet job, A6 #39), so this path is a local-dev
            // convenience, not the normal CI outcome.
            Console.WriteLine(
                "SKIP WorkspecCostRealCliTests: packages/cost-studio/dist/bin.js not found under the repo root. " +
                "Run `pnpm --filter @workspec/cost-studio... build` first to exercise this test for real.");
            return;
        }

        var fixtureDir = Path.Combine(AppContext.BaseDirectory, "Fixtures", "cost-validate-fixture");
        Assert.True(Directory.Exists(fixtureDir), $"Expected the cost-validate-fixture directory at '{fixtureDir}'.");

        var result = await WorkspecCliRunner.RunAsync(
            new WorkspecCliInvocation(cliPath),
            ["validate", "--json", "--dir", fixtureDir],
            AppContext.BaseDirectory,
            CancellationToken.None);

        Assert.True(
            result.ExitCode is 0 or 1,
            $"Expected `validate --json` to exit 0 or 1. Exit code: {result.ExitCode}. Stderr: {result.Stderr}");

        var diagnostics = WorkspecCliRunner.ParseDiagnostics(result.Stdout);

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
