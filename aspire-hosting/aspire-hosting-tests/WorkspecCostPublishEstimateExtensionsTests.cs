using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Pipelines;
using Azure.Provisioning;
using Azure.Provisioning.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Tests the publish-time cost-estimate step's actual logic
/// (<see cref="WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync"/>) against a real,
/// in-memory app model — including a real <c>AddAzureStorage</c> resource, so the extracted SKU
/// comes from Bicep Aspire itself actually generated, not a hand-written stand-in. Deliberately does
/// NOT drive this through the experimental <c>Aspire.Hosting.Pipelines</c> executor (registering and
/// running a real <c>aspire publish</c> pipeline in-process is not something
/// <c>DistributedApplicationTestingBuilder</c> supports in this Aspire version — confirmed while
/// building this slice) — the pipeline-registration glue in <c>WithPublishCostEstimate</c> is a thin,
/// two-line call to a well-known Aspire extension method with no branching of its own, so testing
/// the step body directly here (which is exactly what actually runs) is the right level.
/// </summary>
public class WorkspecCostPublishEstimateExtensionsTests
{
    [Fact]
    public async Task WriteEstimateArtifactAsync_WithNoAzureResources_IsGracefulNoOp()
    {
        using var outputScope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddWorkspecCost("cost", outputScope.Path);
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        await WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync(
            model,
            appHostDirectory: builder.AppHostDirectory,
            apphostName: "test-apphost",
            artifactFileName: "cost-estimate.json",
            outputPath: outputScope.Path,
            logger: NullLogger.Instance,
            cancellationToken: CancellationToken.None);

        Assert.Empty(Directory.GetFiles(outputScope.Path));
    }

    [Fact]
    public async Task WriteEstimateArtifactAsync_WithAzureStorageResource_WritesArtifactWithExtractedSkuAndNoRoleAssignments()
    {
        using var outputScope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddAzureStorage("storage");
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        await WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync(
            model,
            appHostDirectory: builder.AppHostDirectory,
            apphostName: "test-apphost",
            artifactFileName: "cost-estimate.json",
            outputPath: outputScope.Path,
            logger: NullLogger.Instance,
            cancellationToken: CancellationToken.None);

        var artifactPath = Path.Combine(outputScope.Path, "cost-estimate.json");
        Assert.True(File.Exists(artifactPath));

        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(artifactPath));
        var root = document.RootElement;

        Assert.Equal("workspec.dev/cost-estimate/v1", root.GetProperty("apiVersion").GetString());
        Assert.Equal("CostEstimate", root.GetProperty("kind").GetString());
        Assert.Equal("test-apphost", root.GetProperty("metadata").GetProperty("apphost").GetString());

        var resources = root.GetProperty("resources").EnumerateArray().ToList();
        Assert.NotEmpty(resources);

        // Role-assignment companion resources (the "storage-roles" AzureProvisioningResource Aspire
        // synthesizes automatically) must be excluded — they're never billable.
        Assert.DoesNotContain(resources, r => r.GetProperty("type").GetString()!.StartsWith("Microsoft.Authorization/", StringComparison.Ordinal));

        var storageAccount = Assert.Single(resources, r => r.GetProperty("type").GetString() == "Microsoft.Storage/storageAccounts");
        Assert.Equal("storage", storageAccount.GetProperty("aspireResourceName").GetString());
        var sku = storageAccount.GetProperty("sku");
        Assert.False(sku.ValueKind == JsonValueKind.Null);
        Assert.False(string.IsNullOrEmpty(sku.GetProperty("name").GetString()));

        var summary = root.GetProperty("summary");
        Assert.Equal(resources.Count, summary.GetProperty("resourceCount").GetInt32());
    }

    [Fact]
    public async Task WriteEstimateArtifactAsync_WithNullOutputPath_FallsBackUnderAppHostDirectory()
    {
        using var appHostScope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddAzureStorage("storage");
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        await WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync(
            model,
            appHostDirectory: appHostScope.Path,
            apphostName: "test-apphost",
            artifactFileName: "cost-estimate.json",
            outputPath: null,
            logger: NullLogger.Instance,
            cancellationToken: CancellationToken.None);

        var fallbackPath = Path.Combine(appHostScope.Path, "cost-estimate", "cost-estimate.json");
        Assert.True(File.Exists(fallbackPath));
    }

    [Fact]
    public async Task WriteEstimateArtifactAsync_WithCustomArtifactFileName_UsesIt()
    {
        using var outputScope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddAzureStorage("storage");
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        await WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync(
            model,
            appHostDirectory: builder.AppHostDirectory,
            apphostName: "test-apphost",
            artifactFileName: "custom-estimate.json",
            outputPath: outputScope.Path,
            logger: NullLogger.Instance,
            cancellationToken: CancellationToken.None);

        Assert.True(File.Exists(Path.Combine(outputScope.Path, "custom-estimate.json")));
    }

    // B2 regression (adversarial review), end to end against real Aspire-generated Bicep: a
    // customized storage account whose sku name is a ProvisioningParameter (generating
    // `param sku string = '...'` + `sku: { name: sku }` — the same fully-parameterized shape
    // AddAzureServiceBus produces by default) must land in the artifact as sku: null AND be
    // counted in summary.unknownSkuCount.
    [Fact]
    public async Task WriteEstimateArtifactAsync_WithParameterizedSku_RecordsNullSkuAndCountsItUnknown()
    {
        using var outputScope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddAzureStorage("storage").ConfigureInfrastructure(infra =>
        {
            var skuParam = new ProvisioningParameter("sku", typeof(string)) { Value = "Standard_LRS" };
            infra.Add(skuParam);
            var account = infra.GetProvisionableResources().OfType<StorageAccount>().Single();
            account.Sku = new StorageSku { Name = skuParam };
        });
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        await WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync(
            model,
            appHostDirectory: builder.AppHostDirectory,
            apphostName: "test-apphost",
            artifactFileName: "cost-estimate.json",
            outputPath: outputScope.Path,
            logger: NullLogger.Instance,
            cancellationToken: CancellationToken.None);

        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(outputScope.Path, "cost-estimate.json")));
        var root = document.RootElement;

        var resources = root.GetProperty("resources").EnumerateArray().ToList();
        var storageAccount = Assert.Single(resources, r => r.GetProperty("type").GetString() == "Microsoft.Storage/storageAccounts");
        Assert.Equal(JsonValueKind.Null, storageAccount.GetProperty("sku").ValueKind);

        var nullSkuCount = resources.Count(r => r.GetProperty("sku").ValueKind == JsonValueKind.Null);
        Assert.True(nullSkuCount >= 1);
        Assert.Equal(nullSkuCount, root.GetProperty("summary").GetProperty("unknownSkuCount").GetInt32());
    }

    // N5 (adversarial review): the artifact's resource list is sorted by
    // (aspireResourceName, bicepSymbol) so re-publishing yields diff-stable output regardless of
    // model iteration order.
    [Fact]
    public async Task WriteEstimateArtifactAsync_SortsResourcesByAspireResourceNameThenBicepSymbol()
    {
        using var outputScope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        // Registered in anti-alphabetical order on purpose — the artifact must come out sorted.
        builder.AddAzureStorage("zeta");
        builder.AddAzureStorage("alpha");
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        await WorkspecCostPublishEstimateExtensions.WriteEstimateArtifactAsync(
            model,
            appHostDirectory: builder.AppHostDirectory,
            apphostName: "test-apphost",
            artifactFileName: "cost-estimate.json",
            outputPath: outputScope.Path,
            logger: NullLogger.Instance,
            cancellationToken: CancellationToken.None);

        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(outputScope.Path, "cost-estimate.json")));
        var keys = document.RootElement.GetProperty("resources").EnumerateArray()
            .Select(r => (Name: r.GetProperty("aspireResourceName").GetString()!, Symbol: r.GetProperty("bicepSymbol").GetString()!))
            .ToList();

        var sorted = keys
            .OrderBy(k => k.Name, StringComparer.Ordinal)
            .ThenBy(k => k.Symbol, StringComparer.Ordinal)
            .ToList();
        Assert.Equal(sorted, keys);
        Assert.Contains(keys, k => k.Name == "alpha");
        Assert.Contains(keys, k => k.Name == "zeta");
    }

    [Fact]
    public void WithPublishCostEstimate_ReturnsSameBuilderForChaining()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var chained = cost.WithPublishCostEstimate();

        Assert.Same(cost, chained);
    }

    [Fact]
    public void DefaultArtifactFileNameFor_IsScopedByResourceName()
    {
        Assert.Equal("cost.cost-estimate.json", WorkspecCostPublishEstimateExtensions.DefaultArtifactFileNameFor("cost"));
        Assert.Equal("billing.cost-estimate.json", WorkspecCostPublishEstimateExtensions.DefaultArtifactFileNameFor("billing"));
    }

    // N1 regression (adversarial review): the pipeline executor keys steps by name (ToDictionary),
    // so two cost resources with publish estimates must register DISTINCT step names or
    // `aspire publish` crashes. Invokes each resource's actual PipelineStepAnnotation factory (the
    // exact code path the executor runs) and asserts the produced names.
    [Fact]
    public async Task WithPublishCostEstimate_TwoResources_ProduceDistinctlyNamedPipelineSteps()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost1 = builder.AddWorkspecCost("cost1", scope.Path).WithPublishCostEstimate();
        var cost2 = builder.AddWorkspecCost("cost2", scope.Path).WithPublishCostEstimate();
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

#pragma warning disable ASPIREPIPELINES001 // Test-only: driving the experimental factory contexts directly, same surface WithPublishCostEstimate itself registers against.
        var stepNames = new List<string>();
        foreach (var resource in new IResource[] { cost1.Resource, cost2.Resource })
        {
            var annotation = Assert.Single(resource.Annotations.OfType<PipelineStepAnnotation>());
            var pipelineContext = new PipelineContext(
                model,
                new DistributedApplicationExecutionContext(DistributedApplicationOperation.Publish),
                app.Services,
                NullLogger.Instance,
                CancellationToken.None);
            var steps = await annotation.CreateStepsAsync(new PipelineStepFactoryContext
            {
                PipelineContext = pipelineContext,
                Resource = resource,
            });
            stepNames.AddRange(steps.Select(s => s.Name));
        }
#pragma warning restore ASPIREPIPELINES001

        Assert.Equal(["workspec-cost-estimate-cost1", "workspec-cost-estimate-cost2"], stepNames);
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-cost-publish-estimate-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
