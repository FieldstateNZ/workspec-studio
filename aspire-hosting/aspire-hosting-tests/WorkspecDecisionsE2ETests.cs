using System.Net;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// The ONE test class in this slice that needs the real <c>@workspec/decision-studio</c> CLI
/// (<c>packages/decision-studio/dist/bin.js</c>, built via
/// <c>pnpm --filter @workspec/decision-studio... build</c>) — every other test in this project either
/// uses no CLI at all or a committed fake-CLI fixture script. Boots a real
/// <see cref="WorkspecDecisionsStudioResource"/> via <see cref="DistributedApplicationTestingBuilder"/>
/// and exercises it end to end: real Node child process, real Express server, real health check.
/// </summary>
/// <remarks>
/// Mirrors aspire-hosting-c4's <c>WorkspecC4E2ETests</c> exactly — see that class's own remarks for
/// why <c>aspire-hosting-e2e-fixture-apphost</c> exists and why CLI resolution here is hermetic (a
/// per-test temp <c>AppHostDirectory</c> with a <c>node_modules/.bin/workspec-decisions</c> symlink to
/// the real built <c>bin.js</c>, no process-global env var).
/// </remarks>
public class WorkspecDecisionsE2ETests
{
    [Fact]
    public async Task AddWorkspecDecisions_WithRealCli_ServesHealthyDecisionStudio()
    {
        var cliPath = FindBuiltCliPath();
        if (cliPath is null)
        {
            // Skip-with-message rather than fail: dotnet test must stay runnable standalone without
            // a JS toolchain. CI builds packages/decision-studio first (.github/workflows/ci.yml)
            // specifically so this test exercises the real CLI there, not just this skip path.
            Console.WriteLine(
                "SKIP WorkspecDecisionsE2ETests: packages/decision-studio/dist/bin.js not found under the repo root. " +
                "Run `pnpm --filter @workspec/decision-studio... build` first to exercise this test for real.");
            return;
        }

        using var appHostDir = new TempDirectory();
        using var decisionsDir = new TempDirectory();
        InstallCliSymlink(appHostDir.Path, cliPath);

        // No decision/catalog artifacts are seeded — an empty directory is a legitimate, valid state
        // for workspec-decisions serve (an empty explorer), and this test only asserts the host itself
        // comes up healthy and its JSON API responds, not any particular decision content.
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Program>(
            [],
            (options, _) => options.ProjectDirectory = appHostDir.Path,
            CancellationToken.None);

        var decisions = builder.AddWorkspecDecisions("decisions", decisionsDir.Path);

        await using var app = await builder.BuildAsync();
        await app.StartAsync();

        // Real Node child process + Express server startup has real-world latency — generous
        // timeout, not the tight ones appropriate for the in-memory-model tests elsewhere.
        using var healthyCts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await app.ResourceNotifications.WaitForResourceHealthyAsync(decisions.Resource.Name, healthyCts.Token);

        using var http = app.CreateHttpClient(decisions.Resource.Name, "http");

        var healthResponse = await http.GetAsync("/api/health", healthyCts.Token);
        Assert.Equal(HttpStatusCode.OK, healthResponse.StatusCode);
        var healthBody = await healthResponse.Content.ReadAsStringAsync(healthyCts.Token);
        Assert.Contains("\"ok\":true", healthBody, StringComparison.Ordinal);

        var decisionsResponse = await http.GetAsync("/api/decisions", healthyCts.Token);
        Assert.Equal(HttpStatusCode.OK, decisionsResponse.StatusCode);
        var decisionsBody = await decisionsResponse.Content.ReadAsStringAsync(healthyCts.Token);

        using var decisionsJson = JsonDocument.Parse(decisionsBody);
        // Round-tripping through the real running CLI's JSON API is what this asserts — an empty
        // directory legitimately yields an empty array, not any particular decision count.
        Assert.Equal(JsonValueKind.Array, decisionsJson.RootElement.ValueKind);

        await app.StopAsync();
    }

    private static void InstallCliSymlink(string appHostDirectory, string cliPath)
    {
        var binDir = Path.Combine(appHostDirectory, "node_modules", ".bin");
        Directory.CreateDirectory(binDir);
        File.CreateSymbolicLink(Path.Combine(binDir, "workspec-decisions"), cliPath);
    }

    private static string? FindBuiltCliPath()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null)
        {
            return null;
        }

        var cliPath = Path.Combine(repoRoot, "packages", "decision-studio", "dist", "bin.js");
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
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-decisions-e2e-tests-").FullName;

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
