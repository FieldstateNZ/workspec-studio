using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecGraphSyncExtensionsTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    // --- MapSyncResultToProperty: pure diagnostics-to-snapshot-property mapping, tested directly,
    // independent of the eventing/logging plumbing that calls it. Sync outcomes are a snapshot
    // PROPERTY (workspec.sync), deliberately never the resource's lifecycle State — health
    // aggregation only computes while State == Running, so a custom state string would null the
    // resource's health status (see WithGraphSync's remarks). ---

    [Fact]
    public void MapSyncResultToProperty_CliMissing_ReturnsUnavailable()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: true, ExitCode: -1, Diagnostics: [], RawStderr: "boom");

        Assert.Equal("unavailable", WorkspecGraphSyncExtensions.MapSyncResultToProperty(result, WorkspecGraphSyncMode.Check));
    }

    [Fact]
    public void MapSyncResultToProperty_UnexpectedExit_ReturnsUnavailable()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 2, Diagnostics: [], RawStderr: "usage error", UnexpectedExit: true);

        Assert.Equal("unavailable", WorkspecGraphSyncExtensions.MapSyncResultToProperty(result, WorkspecGraphSyncMode.Check));
    }

    [Fact]
    public void MapSyncResultToProperty_CheckModeClean_ReturnsInSync()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 0, Diagnostics: [], RawStderr: "");

        Assert.Equal("in-sync", WorkspecGraphSyncExtensions.MapSyncResultToProperty(result, WorkspecGraphSyncMode.Check));
    }

    [Fact]
    public void MapSyncResultToProperty_CheckModeDrift_ReturnsDriftWithDiagnosticCount()
    {
        var diagnostics = new[] { new WorkspecCliDiagnostic("error", "element-missing", "m", "f.yaml") };
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 1, Diagnostics: diagnostics, RawStderr: "");

        Assert.Equal("drift(1)", WorkspecGraphSyncExtensions.MapSyncResultToProperty(result, WorkspecGraphSyncMode.Check));
    }

    [Fact]
    public void MapSyncResultToProperty_ScaffoldModeSuccess_ReturnsInSync_TreeWasJustWritten()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 0, Diagnostics: [], RawStderr: "wrote 2 file(s)");

        Assert.Equal("in-sync", WorkspecGraphSyncExtensions.MapSyncResultToProperty(result, WorkspecGraphSyncMode.Scaffold));
    }

    // --- FormatSyncSummaryMarkdown ---

    [Fact]
    public void FormatSyncSummaryMarkdown_CliMissing_ExplainsFailure()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: true, ExitCode: -1, Diagnostics: [], RawStderr: "failed to start 'workspec-c4': No such file or directory");

        var markdown = WorkspecGraphSyncExtensions.FormatSyncSummaryMarkdown(result);

        Assert.Contains("could not be started", markdown);
    }

    [Fact]
    public void FormatSyncSummaryMarkdown_UnexpectedExit_MentionsExitCode()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 2, Diagnostics: [], RawStderr: "usage error", UnexpectedExit: true);

        var markdown = WorkspecGraphSyncExtensions.FormatSyncSummaryMarkdown(result);

        Assert.Contains("2", markdown);
        Assert.Contains("usage error", markdown);
    }

    [Fact]
    public void FormatSyncSummaryMarkdown_NoStderr_ReportsNoChanges()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 0, Diagnostics: [], RawStderr: "");

        Assert.Equal("No changes.", WorkspecGraphSyncExtensions.FormatSyncSummaryMarkdown(result));
    }

    [Fact]
    public void FormatSyncSummaryMarkdown_WithStderr_ReturnsTrimmedText()
    {
        var result = new WorkspecGraphSyncResult(CliMissing: false, ExitCode: 0, Diagnostics: [], RawStderr: "  wrote a.yaml\nwrote b.yaml\n  ");

        Assert.Equal("wrote a.yaml\nwrote b.yaml", WorkspecGraphSyncExtensions.FormatSyncSummaryMarkdown(result));
    }

    // --- RunImportAspireAsync: real process execution against committed fake-CLI fixture scripts,
    // resolved via a per-test node_modules/.bin (fully isolated in a fresh temp directory — no process-global
    // env var mutation, so no risk of colliding with other test classes' WORKSPEC_CLI_C4 env var use
    // under xunit's default cross-class parallelization). ---

    [Fact]
    public async Task RunImportAspireAsync_CheckMode_CleanFixture_ReturnsEmptyDiagnostics_AndWritesGraphDump()
    {
        using var appHostDir = new TempDirectory();
        InstallFakeLocalBin(appHostDir.Path, "fake-workspec-c4-clean.sh");

        var (resource, model, app) = BuildResourceAndModel(appHostDir.Path);
        using (app)
        {
            var result = await WorkspecGraphSyncExtensions.RunImportAspireAsync(
                resource, model, "test-apphost", appHostDir.Path, WorkspecGraphSyncMode.Check, CancellationToken.None);

            Assert.False(result.CliMissing);
            Assert.False(result.UnexpectedExit);
            Assert.Equal(0, result.ExitCode);
            Assert.Empty(result.Diagnostics);

            // The documented scratch-path convention: {AppHostDirectory}/obj/workspec-c4/{resourceName}.graph.json.
            var dumpPath = Path.Combine(appHostDir.Path, "obj", "workspec-c4", $"{resource.Name}.graph.json");
            Assert.True(File.Exists(dumpPath));
        }
    }

    [Fact]
    public async Task RunImportAspireAsync_CheckMode_DriftFixture_ReturnsParsedDiagnostics()
    {
        using var appHostDir = new TempDirectory();
        InstallFakeLocalBin(appHostDir.Path, "fake-workspec-c4-drift.sh");

        var (resource, model, app) = BuildResourceAndModel(appHostDir.Path);
        using (app)
        {
            var result = await WorkspecGraphSyncExtensions.RunImportAspireAsync(
                resource, model, "test-apphost", appHostDir.Path, WorkspecGraphSyncMode.Check, CancellationToken.None);

            Assert.False(result.CliMissing);
            Assert.False(result.UnexpectedExit);
            Assert.Equal(1, result.ExitCode);
            Assert.Equal(2, result.Diagnostics.Count);
            Assert.Contains(result.Diagnostics, d => d.Severity == "error" && d.Code == "element-missing");
            Assert.Contains(result.Diagnostics, d => d.Severity == "warning" && d.Code == "field-drift");
        }
    }

    [Fact]
    public async Task RunImportAspireAsync_ScaffoldMode_ScaffoldFixture_ReturnsRawStderr_AndNoDiagnostics()
    {
        using var appHostDir = new TempDirectory();
        InstallFakeLocalBin(appHostDir.Path, "fake-workspec-c4-scaffold.sh");

        var (resource, model, app) = BuildResourceAndModel(appHostDir.Path);
        using (app)
        {
            var result = await WorkspecGraphSyncExtensions.RunImportAspireAsync(
                resource, model, "test-apphost", appHostDir.Path, WorkspecGraphSyncMode.Scaffold, CancellationToken.None);

            Assert.False(result.CliMissing);
            Assert.False(result.UnexpectedExit);
            Assert.Equal(0, result.ExitCode);
            Assert.Empty(result.Diagnostics);
            Assert.Contains("wrote .workspec/containers/api.yaml", result.RawStderr);
            Assert.Contains("wrote .workspec/containers/cache.yaml", result.RawStderr);
        }
    }

    // --- Resource wiring: WithGraphSync also registers the on-demand "Sync .workspec" command. ---

    [Fact]
    public void WithGraphSync_RegistersSyncWorkspecCommand()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", scope.Path).WithGraphSync();

        var commandNames = c4.Resource.Annotations.OfType<ResourceCommandAnnotation>().Select(c => c.Name).ToList();
        Assert.Contains("sync-workspec", commandNames);
    }

    private static (WorkspecC4StudioResource Resource, DistributedApplicationModel Model, DistributedApplication App) BuildResourceAndModel(string appHostDirectory)
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();
        var resource = new WorkspecC4StudioResource("c4", "workspec-c4", appHostDirectory, appHostDirectory);
        return (resource, model, app);
    }

    // Installs a fixture script as the "local node_modules/.bin/workspec-c4" WorkspecCliLocator would
    // find for WorkingDirectory == appHostDirectory — keeps every RunImportAspireAsync test hermetic to
    // its own temp directory instead of mutating the process-global WORKSPEC_CLI_C4 env var (which
    // WorkspecCliLocatorTests also uses, and which xunit's default cross-class parallelization would
    // otherwise make a real collision risk).
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
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-graph-sync-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
