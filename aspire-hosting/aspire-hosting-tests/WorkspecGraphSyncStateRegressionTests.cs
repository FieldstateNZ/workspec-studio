using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Regression for the adversarial-review blocking finding: graph sync must publish its outcome as a
/// snapshot <b>property</b> (<c>workspec.sync</c>) and must never override the resource's lifecycle
/// <c>State</c>. <c>CustomResourceSnapshot.ComputeHealthStatus</c> only computes aggregate health
/// while <c>State == Running</c>, so the old behavior (publishing "Drift detected (N)" etc. as
/// State) nulled health, broke <c>WaitForResourceHealthyAsync</c>/<c>WaitFor</c>, and masked the
/// real lifecycle on the dashboard. Uses a real orchestrated run (testing builder + DCP) with a
/// committed fake CLI — no Node/pnpm required, unlike the E2E class.
/// </summary>
public class WorkspecGraphSyncStateRegressionTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    private static readonly string[] LegacySyncStateTexts = ["In sync", "Sync unavailable", "Drift detected (2)"];

    [Fact]
    public async Task WithGraphSync_OnDrift_PublishesSyncPropertyAndLeavesLifecycleStateUntouched()
    {
        using var appHostDir = new TempDirectory();
        using var workspecDir = new TempDirectory();

        // The fake CLI handles BOTH invocations the integration makes: `serve` (the resource's own
        // process — just stays alive) and `import-aspire` (exits 1 with two drift diagnostics).
        // Installed as a node_modules/.bin local CLI under a per-test AppHostDirectory override, so
        // WorkspecCliLocator resolves it hermetically — no env vars, no cross-test collisions.
        InstallFakeLocalBin(appHostDir.Path, "fake-workspec-c4-serve-drift.sh");

        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Program>(
            [],
            (options, _) => options.ProjectDirectory = appHostDir.Path,
            CancellationToken.None);

        var c4 = builder.AddWorkspecC4("c4", workspecDir.Path).WithGraphSync();

        await using var app = await builder.BuildAsync();
        await app.StartAsync();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));

        // Wait for the sync outcome to land on the snapshot, then assert on that very snapshot:
        // the property carries the drift marker AND State was not overridden by the sync.
        var syncEvent = await app.ResourceNotifications.WaitForResourceAsync(
            c4.Resource.Name,
            e => e.Snapshot.Properties.Any(p => p.Name == WorkspecGraphSyncExtensions.SyncPropertyName),
            cts.Token);

        var syncProperty = Assert.Single(
            syncEvent.Snapshot.Properties,
            p => p.Name == WorkspecGraphSyncExtensions.SyncPropertyName);
        Assert.Equal("drift(2)", syncProperty.Value);

        var stateText = syncEvent.Snapshot.State?.Text;
        Assert.All(LegacySyncStateTexts, legacy => Assert.NotEqual(legacy, stateText));

        await app.StopAsync();
    }

    private static void InstallFakeLocalBin(string appHostDirectory, string fixtureFileName)
    {
        var binDir = Path.Combine(appHostDirectory, "node_modules", ".bin");
        Directory.CreateDirectory(binDir);
        var binPath = Path.Combine(binDir, "workspec-c4");
        File.Copy(Path.Combine(FixturesDirectory, fixtureFileName), binPath, overwrite: true);

        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(
                binPath,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute
                    | UnixFileMode.GroupRead | UnixFileMode.GroupExecute
                    | UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
        }
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-c4-sync-state-tests-").FullName;

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
