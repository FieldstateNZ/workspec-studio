using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;

namespace Aspire.Hosting.Workspec.Tests;

public class WithDecisionExtensionsTests
{
    // --- Static wiring: relationship annotation + ref registration, no orchestrated run. ---

    [Fact]
    public void WithDecision_AddsGovernedByRelationshipToDecisionsResource()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);
        var api = builder.AddExecutable("api", "sleep", scope.Path, "300");

        api.WithDecision(decisions, "decisions/pick-db.decision.yaml");

        var relationship = Assert.Single(api.Resource.Annotations.OfType<ResourceRelationshipAnnotation>());
        Assert.Equal("governed-by", relationship.Type);
        Assert.Same(decisions.Resource, relationship.Resource);
    }

    [Fact]
    public void WithDecision_RegistersRefOnTheDecisionsResource()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);
        var api = builder.AddExecutable("api", "sleep", scope.Path, "300");

        api.WithDecision(decisions, "decisions/pick-db.decision.yaml");

        Assert.Equal(["decisions/pick-db.decision.yaml"], decisions.Resource.RegisteredDecisionRefs);
    }

    [Fact]
    public void WithDecision_MultipleGovernedResources_PreservesRegistrationOrder()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);
        var api = builder.AddExecutable("api", "sleep", scope.Path, "300");
        var worker = builder.AddExecutable("worker", "sleep", scope.Path, "300");

        api.WithDecision(decisions, "decisions/pick-db.decision.yaml");
        worker.WithDecision(decisions, "decisions/pick-queue.decision.yaml");

        Assert.Equal(
            ["decisions/pick-db.decision.yaml", "decisions/pick-queue.decision.yaml"],
            decisions.Resource.RegisteredDecisionRefs);
    }

    [Fact]
    public void WithDecision_AddsAUrlsCallbackAnnotation_TargetingTheDecisionsEndpoint()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);
        var api = builder.AddExecutable("api", "sleep", scope.Path, "300");

        api.WithDecision(decisions, "decisions/pick-db.decision.yaml");

        // The URL isn't resolved until endpoints are allocated at runtime (see
        // WithDecision_ResolvesUrlToDecisionsResourcesAllocatedEndpoint_AtRuntime below for that) —
        // here we only assert the callback annotation itself was registered, i.e. that WithUrl was
        // actually reached rather than short-circuited.
        Assert.Contains(api.Resource.Annotations, a => a is ResourceUrlsCallbackAnnotation);
    }

    [Fact]
    public void WithDecision_WorksForAnyResourceType_NotJustOnesWithEndpoints()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);
        // A parameter resource has no endpoints at all — WithDecision's `T : IResource` constraint
        // (not `IResourceWithEndpoints`) must still accept it.
        var value = builder.AddParameter("region", "us-east-1");

        value.WithDecision(decisions, "decisions/pick-region.decision.yaml");

        Assert.Contains(value.Resource.Annotations, a => a is ResourceRelationshipAnnotation r && r.Type == "governed-by");
    }

    // --- Runtime: the URL actually resolves to the decisions resource's REAL allocated endpoint,
    // not a hardcoded port. Uses a real orchestrated run (testing builder + DCP) with a committed
    // fake CLI whose `serve` just stays alive — no Node/pnpm required, unlike the E2E class. ---

    [Fact]
    public async Task WithDecision_ResolvesUrlToDecisionsResourcesAllocatedEndpoint_AtRuntime()
    {
        using var appHostDir = new TempDirectory();
        using var decisionsDir = new TempDirectory();
        InstallFakeLocalBin(appHostDir.Path, "fake-workspec-decisions-serve.sh");

        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Program>(
            [],
            (options, _) => options.ProjectDirectory = appHostDir.Path,
            CancellationToken.None);

        var decisions = builder.AddWorkspecDecisions("decisions", decisionsDir.Path);
        // 20s, not minutes: this test really orchestrates via DCP, and a shutdown race can
        // occasionally leak the child — keep any orphan short-lived.
        var api = builder.AddExecutable("api", "sleep", appHostDir.Path, "20");
        api.WithDecision(decisions, "decisions/pick-db.decision.yaml");

        await using var app = await builder.BuildAsync();
        await app.StartAsync();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));

        // Wait for the URL to show up on "api"'s own snapshot rather than for either resource to
        // become Healthy: the fake `serve` never opens a real socket, so a health probe against it
        // would never succeed — exactly like aspire-hosting-c4's WorkspecGraphSyncStateRegressionTests
        // waits on a snapshot property instead of health for the same reason.
        var urlEvent = await app.ResourceNotifications.WaitForResourceAsync(
            api.Resource.Name,
            e => e.Snapshot.Urls.Any(u => u.DisplayProperties.DisplayName == "Decision: decisions/pick-db.decision.yaml"),
            cts.Token);

        var urlSnapshot = Assert.Single(
            urlEvent.Snapshot.Urls,
            u => u.DisplayProperties.DisplayName == "Decision: decisions/pick-db.decision.yaml");

        // The decisive assertion: the URL is the decisions resource's OWN real allocated endpoint —
        // not a hardcoded port, not the "api" resource's own address.
        var decisionsEndpoint = decisions.GetEndpoint("http");
        Assert.True(decisionsEndpoint.IsAllocated);
        Assert.Equal(decisionsEndpoint.Url, urlSnapshot.Url);

        await app.StopAsync();
    }

    private static void InstallFakeLocalBin(string appHostDirectory, string fixtureFileName)
    {
        var fixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");
        var binDir = Path.Combine(appHostDirectory, "node_modules", ".bin");
        Directory.CreateDirectory(binDir);
        var binPath = Path.Combine(binDir, "workspec-decisions");
        File.Copy(Path.Combine(fixturesDirectory, fixtureFileName), binPath, overwrite: true);

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
        public string Path { get; } = Directory.CreateTempSubdirectory("with-decision-tests-").FullName;

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
