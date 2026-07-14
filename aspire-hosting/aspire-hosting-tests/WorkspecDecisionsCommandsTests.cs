using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Exercises the "Validate" and "Render ADR" dashboard commands' <c>executeCommand</c> delegates
/// directly (via the registered <see cref="ResourceCommandAnnotation"/>), against committed fake-CLI
/// fixtures — no real orchestrated run needed, since neither command touches
/// <see cref="ExecuteCommandContext.ServiceProvider"/> or <see cref="ExecuteCommandContext.Logger"/>.
/// This is new coverage relative to aspire-hosting-c4's WorkspecC4ExtensionsTests, which only asserts
/// that these commands are registered by name, never invokes them (see A4's own malformed-JSON and
/// ref-resolution requirements this closes).
/// </summary>
public class WorkspecDecisionsCommandsTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    // --- Validate ---

    [Fact]
    public async Task Validate_CleanFixture_ReturnsSuccessWithCleanMarkdown()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-clean.sh");

        var result = await ExecuteCommandAsync(decisions, "validate");

        Assert.True(result.Success);
        Assert.Contains("No diagnostics", result.Data?.Value);
    }

    [Fact]
    public async Task Validate_ErrorsFixture_ReturnsFailureWithDiagnosticsTable()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-errors.sh");

        var result = await ExecuteCommandAsync(decisions, "validate");

        Assert.False(result.Success);
        Assert.Contains("dangling-sku-ref", result.Data?.Value);
        Assert.Equal(CommandResultFormat.Markdown, result.Data?.Format);
    }

    [Fact]
    public async Task Validate_MalformedJsonFixture_ReturnsCleanFailure_NeverThrows()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-malformed.sh");

        var result = await ExecuteCommandAsync(decisions, "validate");

        Assert.False(result.Success);
        Assert.Contains("could not parse workspec-decisions --json output", result.Message);
    }

    // --- Render ADR ---

    [Fact]
    public async Task RenderAdr_ExactlyOneDecision_ReturnsSuccessWithoutNeedingAnyRef()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-render-single.sh");

        var result = await ExecuteCommandAsync(decisions, "render-adr");

        Assert.True(result.Success);
        Assert.Contains("Rendered ADR", result.Message);
    }

    [Fact]
    public async Task RenderAdr_NoDecisionsFound_ReturnsFailure_EvenWithARegisteredRef()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-render-none.sh");
        // A registered ref must NOT trigger a pointless retry when there is nothing to render at all.
        decisions.Resource.RegisterDecisionRef("decisions/pick-a.decision.yaml");

        var result = await ExecuteCommandAsync(decisions, "render-adr");

        Assert.False(result.Success);
        Assert.Contains("no *.decision.yaml found", result.Message);
    }

    [Fact]
    public async Task RenderAdr_MultipleDecisions_NoRegisteredRef_ReturnsFailureListingAvailableRefs()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-render-multi.sh");

        var result = await ExecuteCommandAsync(decisions, "render-adr");

        Assert.False(result.Success);
        Assert.Contains("multiple decisions found", result.Message);
        Assert.Contains("pick-a", result.Message);
        Assert.Contains("pick-b", result.Message);
    }

    [Fact]
    public async Task RenderAdr_MultipleDecisions_WithRegisteredRef_UsesFirstRegisteredRef_ReturnsSuccess()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-render-multi.sh");
        decisions.Resource.RegisterDecisionRef("decisions/pick-a.decision.yaml");

        var result = await ExecuteCommandAsync(decisions, "render-adr");

        Assert.True(result.Success);
        Assert.Contains("pick-a.decision.yaml", result.Message);
    }

    [Fact]
    public async Task RenderAdr_MultipleDecisions_WithTwoRegisteredRefs_UsesFirstOneInCallOrder()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-render-multi.sh");
        decisions.Resource.RegisterDecisionRef("decisions/pick-a.decision.yaml");
        decisions.Resource.RegisterDecisionRef("decisions/pick-b.decision.yaml");

        var result = await ExecuteCommandAsync(decisions, "render-adr");

        Assert.True(result.Success);
        Assert.Contains("pick-a.decision.yaml", result.Message);
    }

    [Fact]
    public async Task RenderAdr_MultipleDecisions_RegisteredRefDoesNotMatchAny_ReturnsFailure()
    {
        using var scope = new TempDirectory();
        var decisions = AddDecisionsWithFixtureCli(scope.Path, "fake-workspec-decisions-render-multi.sh");
        decisions.Resource.RegisterDecisionRef("decisions/does-not-exist.decision.yaml");

        var result = await ExecuteCommandAsync(decisions, "render-adr");

        Assert.False(result.Success);
        Assert.Contains("no decision matching", result.Message);
    }

    private static IResourceBuilder<WorkspecDecisionsStudioResource> AddDecisionsWithFixtureCli(string appHostDirectory, string fixtureFileName)
    {
        var binDir = Path.Combine(appHostDirectory, "node_modules", ".bin");
        Directory.CreateDirectory(binDir);
        var binPath = Path.Combine(binDir, "workspec-decisions");
        File.Copy(Path.Combine(FixturesDirectory, fixtureFileName), binPath, overwrite: true);

        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(
                binPath,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute
                    | UnixFileMode.GroupRead | UnixFileMode.GroupExecute
                    | UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
        }

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions
        {
            Args = [],
            ProjectDirectory = appHostDirectory,
        });
        return builder.AddWorkspecDecisions("decisions", appHostDirectory);
    }

    private static async Task<ExecuteCommandResult> ExecuteCommandAsync(IResourceBuilder<WorkspecDecisionsStudioResource> decisions, string commandName)
    {
        var annotation = decisions.Resource.Annotations.OfType<ResourceCommandAnnotation>().Single(c => c.Name == commandName);

        using var services = new ServiceCollection().BuildServiceProvider();

        // InteractionInputCollection is [Experimental("ASPIREINTERACTION001")] — this test only
        // needs an empty argument collection (neither command declares any CommandOptions.Arguments),
        // not any of the evolving experimental behavior the diagnostic is warning about.
#pragma warning disable ASPIREINTERACTION001
        var context = new ExecuteCommandContext
        {
            ServiceProvider = services,
            ResourceName = decisions.Resource.Name,
            CancellationToken = CancellationToken.None,
            Logger = NullLogger.Instance,
            Arguments = new InteractionInputCollection([]),
        };
#pragma warning restore ASPIREINTERACTION001

        return await annotation.ExecuteCommand(context);
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-decisions-commands-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
