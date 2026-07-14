using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Verifies <c>WorkspecCostResource</c>'s lifecycle: <c>NotStarted</c> initial state (set via
/// <c>WithInitialState</c>), flipping to <c>Running</c> once the resource actually exists in a real
/// running app (published via <c>ResourceNotificationService</c> from an
/// <see cref="AfterResourcesCreatedEvent"/> subscriber — see <c>WorkspecCostResource</c>'s remarks
/// for why this is the correct, non-DCP pattern for this resource shape, unlike A3's
/// DCP-managed-resource lesson). No CLI involved at all — this resource starts no process of its
/// own — so unlike <c>WorkspecGraphSyncStateRegressionTests</c>, no fake CLI fixture is needed here.
/// </summary>
public class WorkspecCostResourceStateTests
{
    [Fact]
    public void AddWorkspecCost_InitialSnapshot_IsNotStartedWithSourceAndProviderProperties()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var initialAnnotation = Assert.Single(cost.Resource.Annotations.OfType<ResourceSnapshotAnnotation>());
        var snapshot = initialAnnotation.InitialSnapshot;

        Assert.Equal("WorkspecCost", snapshot.ResourceType);
        Assert.Equal(KnownResourceStates.NotStarted, snapshot.State?.Text);
        Assert.Contains(snapshot.Properties, p => p.Name == CustomResourceKnownProperties.Source && (string)p.Value! == scope.Path);
        Assert.Contains(snapshot.Properties, p => p.Name == "workspec.cost.provider" && (string)p.Value! == "azure");
    }

    [Fact]
    public async Task AddWorkspecCost_OnRealAppStart_PublishesRunningState()
    {
        using var scope = new TempDirectory();

        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Program>([], CancellationToken.None);
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        await using var app = await builder.BuildAsync();
        await app.StartAsync();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var runningEvent = await app.ResourceNotifications.WaitForResourceAsync(
            cost.Resource.Name,
            e => e.Snapshot.State?.Text == KnownResourceStates.Running,
            cts.Token);

        Assert.Equal(KnownResourceStates.Running, runningEvent.Snapshot.State?.Text);

        await app.StopAsync();
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-cost-state-tests-").FullName;

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
