using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecDecisionsExtensionsTests
{
    [Fact]
    public void AddWorkspecDecisions_Args_ServesWithResolvedDirAndDynamicPortFlag()
    {
        using var scope = new TempDirectory();

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        var argsAnnotation = Assert.Single(decisions.Resource.Annotations.OfType<CommandLineArgsCallbackAnnotation>());
        var args = InvokeArgsCallback(decisions.Resource, argsAnnotation);

        Assert.Collection(
            args,
            first => Assert.Equal("serve", first),
            second => Assert.Equal("--dir", second),
            third => Assert.Equal(scope.Path, third),
            fourth => Assert.Equal("--port", fourth),
            fifth =>
            {
                // Assert identity/type, not a resolved value — a target port is only assigned once
                // the app actually runs, which this test does not do.
                var expression = Assert.IsType<EndpointReferenceExpression>(fifth);
                Assert.Equal("http", expression.Endpoint.EndpointName);
                Assert.Equal(EndpointProperty.TargetPort, expression.Property);
            });
    }

    [Fact]
    public void AddWorkspecDecisions_WithRelativeDir_ResolvesAgainstAppHostDirectory()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", Path.Combine("sub", "decisions-dir"));

        Assert.Equal(
            Path.GetFullPath(Path.Combine("sub", "decisions-dir"), builder.AppHostDirectory),
            decisions.Resource.DecisionsDirectory);
    }

    [Fact]
    public void AddWorkspecDecisions_WithAbsoluteDir_UsesItAsIs()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        Assert.Equal(scope.Path, decisions.Resource.DecisionsDirectory);
    }

    [Fact]
    public void AddWorkspecDecisions_IsExcludedFromManifest()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        Assert.Contains(decisions.Resource.Annotations, a => a is ManifestPublishingCallbackAnnotation);
    }

    [Fact]
    public void AddWorkspecDecisions_HasWorkspecHealthCheckAnnotation()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        Assert.Contains(decisions.Resource.Annotations, a => a is HealthCheckAnnotation);
    }

    [Fact]
    public void AddWorkspecDecisions_HasHttpEndpointNamedHttp()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        Assert.Contains(decisions.Resource.Annotations, a => a is EndpointAnnotation e && e.Name == "http");
    }

    [Fact]
    public void AddWorkspecDecisions_RegistersValidateAndRenderAdrCommands()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        var commandNames = decisions.Resource.Annotations.OfType<ResourceCommandAnnotation>().Select(c => c.Name).ToList();
        Assert.Contains("validate", commandNames);
        Assert.Contains("render-adr", commandNames);
    }

    [Fact]
    public void AddWorkspecDecisions_NoDecisionRegisteredYet_RegisteredDecisionRefsIsEmpty()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var decisions = builder.AddWorkspecDecisions("decisions", scope.Path);

        Assert.Empty(decisions.Resource.RegisteredDecisionRefs);
    }

    // Mirrors aspire-hosting-c4's WorkspecGraphDumper/WorkspecC4ExtensionsTests helper: first-party
    // WithArgs callbacks (like AddWorkspecDecisions') only append already-built values synchronously,
    // so blocking here is safe.
    private static List<object> InvokeArgsCallback(IResource resource, CommandLineArgsCallbackAnnotation annotation)
    {
        var args = new List<object>();
        var context = new CommandLineArgsCallbackContext(args, resource, CancellationToken.None)
        {
            ExecutionContext = new DistributedApplicationExecutionContext(DistributedApplicationOperation.Run),
        };
        annotation.Callback(context).GetAwaiter().GetResult();
        return args;
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-decisions-extensions-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
