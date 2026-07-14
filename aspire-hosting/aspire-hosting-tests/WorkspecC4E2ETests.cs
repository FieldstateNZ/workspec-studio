using System.Net;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// The ONE test class in this slice that needs the real <c>@workspec/c4-studio</c> CLI
/// (<c>packages/c4-studio/dist/bin.js</c>, built via <c>pnpm --filter @workspec/c4-studio... build</c>)
/// — every other test in this project either uses no CLI at all or a committed fake-CLI fixture
/// script. Boots a real <see cref="Aspire.Hosting.ApplicationModel.WorkspecC4StudioResource"/> via
/// <see cref="DistributedApplicationTestingBuilder"/> and exercises it end to end: real Node child
/// process, real HTTP server, real health check, real graph sync.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="DistributedApplicationTestingBuilder.CreateAsync{TEntryPoint}"/> invokes the real
/// entry point of <typeparamref name="TEntryPoint"/>'s assembly (intercepting
/// <c>DistributedApplication.Build()</c>/<c>Run()</c> via an ambient hook) — it does not work
/// against an arbitrary calling assembly such as this xunit test host (confirmed empirically: the
/// non-generic <c>DistributedApplicationTestingBuilder.Create(string[])</c> overload throws "No
/// application host assembly was found", and <c>CreateAsync&lt;TEntryPoint&gt;</c> against a type in
/// this very test assembly throws "The entry point exited without building a
/// DistributedApplication" because it actually re-invokes the xunit/VSTest test host's own Main).
/// <c>aspire-hosting-e2e-fixture-apphost</c> is a minimal, otherwise-empty AppHost project (SIBLING
/// directory, not nested under this project, so its top-level-statement <c>Program.cs</c> isn't
/// swept into this project's own default compile glob) that exists purely to be that real entry
/// point; the actual resource under test is still added by this test itself, on the builder
/// <c>CreateAsync</c> returns, before <c>BuildAsync()</c>.
/// </para>
/// <para>
/// CLI resolution is hermetic: the test overrides <c>DistributedApplicationOptions.ProjectDirectory</c>
/// to a per-test temp AppHostDirectory containing a <c>node_modules/.bin/workspec-c4</c> symlink to
/// the real built <c>bin.js</c> (a symlink, not a copy, so Node's realpath-based module resolution
/// still finds the CLI's runtime dependencies next to the real file — exactly how npm's own
/// <c>.bin</c> shims work). No process-global <c>WORKSPEC_CLI_C4</c> env var, so no collision risk
/// with <c>WorkspecCliLocatorTests</c> under xunit's cross-class parallelization, and both
/// resolution points (registration-time for <c>serve</c>, event-time for graph sync) find the same
/// real CLI.
/// </para>
/// </remarks>
public class WorkspecC4E2ETests
{
    [Fact]
    public async Task AddWorkspecC4_WithRealCliAndGraphSync_ServesHealthyModelExplorer()
    {
        var cliPath = FindBuiltCliPath();
        if (cliPath is null)
        {
            // Skip-with-message rather than fail: dotnet test must stay runnable standalone
            // without a JS toolchain. CI builds packages/c4-studio first (.github/workflows/ci.yml)
            // specifically so this test exercises the real CLI there, not just this skip path.
            Console.WriteLine(
                "SKIP WorkspecC4E2ETests: packages/c4-studio/dist/bin.js not found under the repo root. " +
                "Run `pnpm --filter @workspec/c4-studio... build` first to exercise this test for real.");
            return;
        }

        using var appHostDir = new TempDirectory();
        using var workspecDir = new TempDirectory();
        InstallCliSymlink(appHostDir.Path, cliPath);

        // Synthesize a .workspec/ tree from A1's committed sample graph fixture via the real CLI's
        // own scaffold command — dogfooding A2's import-aspire for setup, not just for the resource
        // under test below.
        var sampleGraphPath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "workspec-graph-v1.sample.json");
        Assert.True(File.Exists(sampleGraphPath), $"Expected the A1 sample graph fixture at '{sampleGraphPath}'.");

        var scaffoldResult = await WorkspecCliRunner.RunAsync(
            new WorkspecCliInvocation(cliPath),
            ["import-aspire", "--graph", sampleGraphPath, "--dir", workspecDir.Path, "--mode", "scaffold", "--json"],
            AppContext.BaseDirectory,
            CancellationToken.None);
        Assert.True(
            scaffoldResult.ExitCode == 0,
            $"Expected `import-aspire --mode scaffold` to exit 0. Exit code: {scaffoldResult.ExitCode}. Stderr: {scaffoldResult.Stderr}");

        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Program>(
            [],
            (options, _) => options.ProjectDirectory = appHostDir.Path,
            CancellationToken.None);

        var c4 = builder.AddWorkspecC4("c4", workspecDir.Path).WithGraphSync();

        await using var app = await builder.BuildAsync();
        await app.StartAsync();

        // Real Node child process + Express server startup has real-world latency — generous
        // timeout, not the tight ones appropriate for the in-memory-model tests elsewhere.
        // Reaching healthy WITH graph sync enabled is itself a regression assertion: sync outcomes
        // are published as a snapshot property, and must never override lifecycle State (which
        // would null health aggregation and hang this very wait — the review-confirmed bug).
        using var healthyCts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await app.ResourceNotifications.WaitForResourceHealthyAsync(c4.Resource.Name, healthyCts.Token);

        // The on-run check compared this app's own graph (just the c4 executable) against the tree
        // scaffolded from the sample graph — guaranteed drift, surfaced via the workspec.sync
        // property. "unavailable" here would mean the sync never actually ran the real CLI.
        var syncEvent = await app.ResourceNotifications.WaitForResourceAsync(
            c4.Resource.Name,
            e => e.Snapshot.Properties.Any(p => p.Name == WorkspecGraphSyncExtensions.SyncPropertyName),
            healthyCts.Token);
        var syncProperty = Assert.Single(
            syncEvent.Snapshot.Properties,
            p => p.Name == WorkspecGraphSyncExtensions.SyncPropertyName);
        var syncValue = Assert.IsType<string>(syncProperty.Value);
        Assert.StartsWith("drift(", syncValue, StringComparison.Ordinal);

        using var http = app.CreateHttpClient(c4.Resource.Name, "http");

        var healthResponse = await http.GetAsync("/api/health", healthyCts.Token);
        Assert.Equal(HttpStatusCode.OK, healthResponse.StatusCode);
        var healthBody = await healthResponse.Content.ReadAsStringAsync(healthyCts.Token);
        Assert.Contains("\"ok\":true", healthBody, StringComparison.Ordinal);

        var modelResponse = await http.GetAsync("/api/model", healthyCts.Token);
        Assert.Equal(HttpStatusCode.OK, modelResponse.StatusCode);
        var modelBody = await modelResponse.Content.ReadAsStringAsync(healthyCts.Token);

        using var modelJson = JsonDocument.Parse(modelBody);
        // Round-tripping real data through the real running CLI is what this asserts — not any
        // particular diagnostic count, which isn't this test's concern.
        Assert.True(modelJson.RootElement.TryGetProperty("diagnostics", out var diagnostics));
        Assert.Equal(JsonValueKind.Array, diagnostics.ValueKind);

        await app.StopAsync();
    }

    private static void InstallCliSymlink(string appHostDirectory, string cliPath)
    {
        var binDir = Path.Combine(appHostDirectory, "node_modules", ".bin");
        Directory.CreateDirectory(binDir);
        File.CreateSymbolicLink(Path.Combine(binDir, "workspec-c4"), cliPath);
    }

    private static string? FindBuiltCliPath()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null)
        {
            return null;
        }

        var cliPath = Path.Combine(repoRoot, "packages", "c4-studio", "dist", "bin.js");
        return File.Exists(cliPath) ? cliPath : null;
    }

    // Walks up from the test assembly's own output directory looking for pnpm-workspace.yaml — a
    // reliable, unique repo-root marker. Deliberately not a fixed number of `..` segments: the test
    // output path's depth (bin/Release/net10.0/...) is a build-configuration detail that could change.
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

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-c4-e2e-tests-").FullName;

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
                // A just-stopped DCP session can briefly hold the directory; leaking a temp dir is
                // preferable to failing the test on teardown.
            }
        }
    }
}
