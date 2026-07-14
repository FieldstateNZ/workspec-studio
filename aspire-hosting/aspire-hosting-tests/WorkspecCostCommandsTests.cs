using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Exercises the actual "Stocktake"/"Report"/"Validate" dashboard command delegates registered by
/// <c>AddWorkspecCost</c> — not just the underlying runner (<see cref="WorkspecCostCliRunnerTests"/>)
/// or formatter (<see cref="WorkspecCostMarkdownFormatterTests"/>) in isolation. Commands are invoked
/// directly via their <see cref="ResourceCommandAnnotation.ExecuteCommand"/> delegate with a
/// manually-constructed <see cref="ExecuteCommandContext"/> — mirroring
/// <c>WorkspecC4ExtensionsTests</c>'s own <c>InvokeArgsCallback</c> pattern for
/// <see cref="CommandLineArgsCallbackAnnotation"/> — rather than booting a full running app: these
/// commands do no DCP orchestration (no process, no endpoint), so there is nothing a real app boot
/// would add over invoking the delegate directly. CLI resolution is hermetic per test via the
/// <c>WORKSPEC_CLI_COST</c> env var (restored on dispose — see <see cref="EnvVarScope"/>), pointed at
/// committed fake-CLI fixture scripts under Fixtures/.
/// </summary>
public class WorkspecCostCommandsTests
{
    private const string EnvVarName = "WORKSPEC_CLI_COST";
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task Stocktake_WithNoSubscriptionsConfiguredOrDerivable_FailsWithoutRunningCli()
    {
        using var scope = new TempDirectory();
        // Deliberately points at a nonexistent path: if the command's early-return guard is ever
        // removed/broken, this proves it by making the test fail with a "failed to start" message
        // instead of silently "succeeding" against a CLI that was never supposed to run.
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(scope.Path, "definitely-does-not-exist"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "stocktake");

        Assert.False(result.Success);
        Assert.Contains("no subscriptions configured", result.Message, StringComparison.Ordinal);
        Assert.Contains("WithSubscriptions", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Stocktake_WithSubscriptionsConfigured_RunsCliAndSucceeds()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-stocktake-ok.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path).WithSubscriptions("sub-1");

        var result = await InvokeCommandAsync(builder, cost, "stocktake");

        Assert.True(result.Success);
        Assert.Contains("wrote estate.inventory.yaml", result.Data?.Value ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Stocktake_WhenCliFails_ReturnsFailureWithStderr()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-stocktake-fail.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path).WithSubscriptions("sub-1");

        var result = await InvokeCommandAsync(builder, cost, "stocktake");

        Assert.False(result.Success);
        Assert.Contains("invalid --name", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Validate_WithCleanFixture_Succeeds()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-validate-clean.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "validate");

        Assert.True(result.Success);
    }

    [Fact]
    public async Task Validate_WithErrorsFixture_FailsWithDiagnosticsTable()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-validate-errors.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "validate");

        Assert.False(result.Success);
        Assert.Contains("parse-error", result.Data?.Value ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Validate_WithMalformedJsonFixture_FailsWithParseErrorMessage()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-malformed.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "validate");

        Assert.False(result.Success);
        Assert.Contains("could not parse", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Validate_WithMissingCli_FailsWithCouldNotRunMessage()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(scope.Path, "definitely-does-not-exist"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "validate");

        Assert.False(result.Success);
        Assert.Contains("could not run workspec-cost", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Report_WithOkFixture_SucceedsWithRolledUpTable()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-report-ok.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "report");

        Assert.True(result.Success);
        Assert.Contains("coverage[costType]", result.Data?.Value ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Report_WithMissingArtifactsFixture_FailsWithCliMessage()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-report-missing.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "report");

        Assert.False(result.Success);
        Assert.Contains("expected exactly 1 inventory", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Report_WithMalformedJsonFixture_FailsWithParseErrorMessage()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Set(EnvVarName, Path.Combine(FixturesDirectory, "fake-workspec-cost-malformed.sh"));

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var cost = builder.AddWorkspecCost("cost", scope.Path);

        var result = await InvokeCommandAsync(builder, cost, "report");

        Assert.False(result.Success);
        Assert.Contains("could not parse", result.Message, StringComparison.Ordinal);
    }

    private static async Task<ExecuteCommandResult> InvokeCommandAsync(
        IDistributedApplicationBuilder builder,
        IResourceBuilder<WorkspecCostResource> cost,
        string commandName)
    {
        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var annotation = cost.Resource.Annotations.OfType<ResourceCommandAnnotation>().Single(a => a.Name == commandName);

        var services = new ServiceCollection();
        services.AddSingleton(model);
        await using var serviceProvider = services.BuildServiceProvider();

#pragma warning disable ASPIREINTERACTION001 // InteractionInputCollection is experimental in 13.4.6; ExecuteCommandContext.Arguments is a required member with no non-experimental way to populate it. Test-only usage.
        var context = new ExecuteCommandContext
        {
            ServiceProvider = serviceProvider,
            ResourceName = cost.Resource.Name,
            CancellationToken = CancellationToken.None,
            Logger = NullLogger.Instance,
            Arguments = new InteractionInputCollection([]),
        };
#pragma warning restore ASPIREINTERACTION001

        return await annotation.ExecuteCommand(context);
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-cost-commands-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }

    // Environment variables are process-global; tests that touch WORKSPEC_CLI_COST restore the
    // prior value on dispose rather than leaking state across [Fact]s (mirrors
    // WorkspecCliLocatorTests's own EnvVarScope for WORKSPEC_CLI_C4 — a distinct env var name, so no
    // cross-class collision risk under xunit's parallelization).
    private sealed class EnvVarScope : IDisposable
    {
        private readonly string _name;
        private readonly string? _previousValue;

        private EnvVarScope(string name)
        {
            _name = name;
            _previousValue = Environment.GetEnvironmentVariable(name);
        }

        public static EnvVarScope Set(string name, string value)
        {
            var scope = new EnvVarScope(name);
            Environment.SetEnvironmentVariable(name, value);
            return scope;
        }

        public void Dispose() => Environment.SetEnvironmentVariable(_name, _previousValue);
    }
}
