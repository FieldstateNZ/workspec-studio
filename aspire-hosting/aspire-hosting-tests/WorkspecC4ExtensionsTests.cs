using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecC4ExtensionsTests
{
    [Fact]
    public void AddWorkspecC4_Args_ServesWithResolvedDirAndDynamicPortFlag()
    {
        using var scope = new TempDirectory();

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var c4 = builder.AddWorkspecC4("c4", scope.Path);

        var argsAnnotation = Assert.Single(c4.Resource.Annotations.OfType<CommandLineArgsCallbackAnnotation>());
        var args = InvokeArgsCallback(c4.Resource, argsAnnotation);

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
    public void AddWorkspecC4_WithRelativeWorkspecDir_ResolvesAgainstAppHostDirectory()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", Path.Combine("sub", "workspec-dir"));

        Assert.Equal(
            Path.GetFullPath(Path.Combine("sub", "workspec-dir"), builder.AppHostDirectory),
            c4.Resource.WorkspecDirectory);
    }

    [Fact]
    public void AddWorkspecC4_WithAbsoluteWorkspecDir_UsesItAsIs()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", scope.Path);

        Assert.Equal(scope.Path, c4.Resource.WorkspecDirectory);
    }

    [Fact]
    public void AddWorkspecC4_IsExcludedFromManifest()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", scope.Path);

        Assert.Contains(c4.Resource.Annotations, a => a is ManifestPublishingCallbackAnnotation);
    }

    [Fact]
    public void AddWorkspecC4_HasWorkspecHealthCheckAnnotation()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", scope.Path);

        Assert.Contains(c4.Resource.Annotations, a => a is HealthCheckAnnotation);
    }

    [Fact]
    public void AddWorkspecC4_HasHttpEndpointNamedHttp()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", scope.Path);

        Assert.Contains(c4.Resource.Annotations, a => a is EndpointAnnotation e && e.Name == "http");
    }

    [Fact]
    public void AddWorkspecC4_RegistersValidateAndRenderDiagramCommands()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var c4 = builder.AddWorkspecC4("c4", scope.Path);

        var commandNames = c4.Resource.Annotations.OfType<ResourceCommandAnnotation>().Select(c => c.Name).ToList();
        Assert.Contains("validate", commandNames);
        Assert.Contains("render-diagram", commandNames);
    }

    // Mirrors WorkspecGraphDumper's own InvokeArgsCallback helper: first-party WithArgs callbacks
    // (like AddWorkspecC4's) only append already-built values synchronously, so blocking here is safe.
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
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-c4-extensions-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
