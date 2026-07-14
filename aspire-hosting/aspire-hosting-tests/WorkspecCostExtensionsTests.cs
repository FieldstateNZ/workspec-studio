using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecCostExtensionsTests
{
    [Fact]
    public void AddWorkspecCost_WithRelativeDir_ResolvesAgainstAppHostDirectory()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", Path.Combine("sub", "cost-dir"));

        Assert.Equal(
            Path.GetFullPath(Path.Combine("sub", "cost-dir"), builder.AppHostDirectory),
            cost.Resource.CostDirectory);
    }

    [Fact]
    public void AddWorkspecCost_WithAbsoluteDir_UsesItAsIs()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path);

        Assert.Equal(scope.Path, cost.Resource.CostDirectory);
    }

    [Fact]
    public void AddWorkspecCost_IsExcludedFromManifest()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path);

        Assert.Contains(cost.Resource.Annotations, a => a is ManifestPublishingCallbackAnnotation);
    }

    [Fact]
    public void AddWorkspecCost_RegistersStocktakeReportAndValidateCommands()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var commandNames = cost.Resource.Annotations.OfType<ResourceCommandAnnotation>().Select(c => c.Name).ToList();
        Assert.Contains("stocktake", commandNames);
        Assert.Contains("report", commandNames);
        Assert.Contains("validate", commandNames);
    }

    [Fact]
    public void AddWorkspecCost_HasNoSubscriptionsByDefault()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path);

        Assert.Empty(cost.Resource.Subscriptions);
    }

    [Fact]
    public void WithSubscriptions_SetsResourceSubscriptions()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path).WithSubscriptions("sub-1", "sub-2");

        Assert.Equal(["sub-1", "sub-2"], cost.Resource.Subscriptions);
    }

    [Fact]
    public void WithSubscriptions_LastCallReplacesPreviousSet()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var cost = builder.AddWorkspecCost("cost", scope.Path)
            .WithSubscriptions("sub-1")
            .WithSubscriptions("sub-2", "sub-3");

        Assert.Equal(["sub-2", "sub-3"], cost.Resource.Subscriptions);
    }

    [Fact]
    public void WithSubscriptions_WithNoIds_Throws()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        Assert.Throws<ArgumentException>(() => cost.WithSubscriptions());
    }

    [Fact]
    public void WithSubscriptions_WithWhitespaceId_Throws()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        Assert.Throws<ArgumentException>(() => cost.WithSubscriptions("sub-1", "   "));
    }

    [Fact]
    public void DeriveSubscriptionsFromModel_WithNoAzureResources_ReturnsEmpty()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var derived = WorkspecCostExtensions.DeriveSubscriptionsFromModel(model);

        Assert.Empty(derived);
    }

    [Fact]
    public void DeriveSubscriptionsFromModel_WithPlainAzureResourceAndNoExplicitScope_ReturnsEmpty()
    {
        // Documents the finding this slice's research confirmed: a subscription id is a
        // deployment-time ARM scope concept, not something a plain (unscoped)
        // AzureProvisioningResource carries — see WorkspecCostExtensions.DeriveSubscriptionsFromModel's
        // remarks and docs/aspire-hosting/cost-integration.md.
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddAzureStorage("storage");
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var derived = WorkspecCostExtensions.DeriveSubscriptionsFromModel(model);

        Assert.Empty(derived);
    }

    [Fact]
    public void ResolveEffectiveSubscriptions_WithExplicitConfiguration_PrefersExplicitOverDerived()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path).WithSubscriptions("explicit-sub");
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var effective = WorkspecCostExtensions.ResolveEffectiveSubscriptions(cost.Resource, model);

        Assert.Equal(["explicit-sub"], effective);
    }

    [Fact]
    public void ResolveEffectiveSubscriptions_WithNoExplicitConfigurationAndNothingDerivable_ReturnsEmpty()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var effective = WorkspecCostExtensions.ResolveEffectiveSubscriptions(cost.Resource, model);

        Assert.Empty(effective);
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-cost-extensions-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
