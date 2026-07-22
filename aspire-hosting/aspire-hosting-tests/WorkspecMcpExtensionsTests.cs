using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecMcpExtensionsTests
{
    [Fact]
    public void AddWorkspecMcp_Args_EmitsHttpFlagsWithResolvedDirAndDynamicPortAndNoVerb()
    {
        using var scope = new TempDirectory();

        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var mcp = builder.AddWorkspecMcp("mcp", scope.Path);

        var argsAnnotation = Assert.Single(mcp.Resource.Annotations.OfType<CommandLineArgsCallbackAnnotation>());
        var args = InvokeArgsCallback(mcp.Resource, argsAnnotation);

        // Unlike AddWorkspecDecisions/AddWorkspecC4/AddWorkspecCost, workspec-mcp has no subcommand of
        // its own — --http/--dir/--port/--host are top-level flags (see
        // packages/mcp-host/src/cli.ts) — so there must be NO leading verb such as "serve".
        Assert.Collection(
            args,
            first => Assert.Equal("--http", first),
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
            },
            sixth => Assert.Equal("--host", sixth),
            seventh => Assert.Equal("127.0.0.1", seventh));
    }

    [Fact]
    public void AddWorkspecMcp_WithRelativeDir_ResolvesAgainstAppHostDirectory()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var mcp = builder.AddWorkspecMcp("mcp", Path.Combine("sub", "mcp-dir"));

        Assert.Equal(
            Path.GetFullPath(Path.Combine("sub", "mcp-dir"), builder.AppHostDirectory),
            mcp.Resource.McpDirectory);
    }

    [Fact]
    public void AddWorkspecMcp_WithAbsoluteDir_UsesItAsIs()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var mcp = builder.AddWorkspecMcp("mcp", scope.Path);

        Assert.Equal(scope.Path, mcp.Resource.McpDirectory);
    }

    [Fact]
    public void AddWorkspecMcp_HasHttpEndpointNamedHttp()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var mcp = builder.AddWorkspecMcp("mcp", scope.Path);

        Assert.Contains(mcp.Resource.Annotations, a => a is EndpointAnnotation e && e.Name == "http");
    }

    [Fact]
    public void AddWorkspecMcp_IsExcludedFromManifest()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var mcp = builder.AddWorkspecMcp("mcp", scope.Path);

        Assert.Contains(mcp.Resource.Annotations, a => a is ManifestPublishingCallbackAnnotation);
    }

    [Fact]
    public void AddWorkspecMcp_HasWorkspecHealthCheckAnnotation()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var mcp = builder.AddWorkspecMcp("mcp", scope.Path);

        // Mirrors WorkspecDecisionsExtensionsTests' health-check assertion: only annotation
        // presence is checked here (the underlying HealthCheckAnnotation.Key is an opaque
        // registration key, not the probe path). Note the probe path itself
        // (WorkspecMcpExtensions.cs's `.WithWorkspecHealthCheck("http", "/health")` call) differs
        // from the shared default of "/api/health" used by WorkspecHealthCheckExtensions — this
        // resource has no `/api` prefix on its health route (see packages/mcp-host/src/cli.ts).
        Assert.Contains(mcp.Resource.Annotations, a => a is HealthCheckAnnotation);
    }

    [Fact]
    public void AddWorkspecMcp_AttachesMcpServerEndpointAnnotation()
    {
        using var scope = new TempDirectory();
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var mcp = builder.AddWorkspecMcp("mcp", scope.Path);

        // The critical regression guard for this integration: WithMcpServer("/mcp",
        // endpointName: "http") is the whole reason this resource exists (proxying the aggregate
        // workspec-mcp server's tools through Aspire's own MCP tooling). It is an EXPERIMENTAL
        // Aspire.Hosting API (ASPIREMCP001) — a future refactor could silently drop the call while
        // everything else (args/endpoint/health check) still passes, so this asserts the actual
        // annotation it adds is present on the resource.
        //
        // McpServerEndpointAnnotation (Aspire.Hosting.ApplicationModel.McpServerEndpointAnnotation)
        // was confirmed PUBLIC by reflecting on Aspire.Hosting.dll 13.4.6 — this test asserts
        // against that public surface directly rather than falling back to an internals-based
        // check (the test project has InternalsVisibleTo from the hosting assemblies, but not from
        // Aspire.Hosting itself).
        Assert.Contains(mcp.Resource.Annotations, a => a is McpServerEndpointAnnotation);
    }

    // Mirrors aspire-hosting-c4's WorkspecGraphDumper/WorkspecC4ExtensionsTests helper and
    // WorkspecDecisionsExtensionsTests' own copy: first-party WithArgs callbacks (like
    // AddWorkspecMcp's) only append already-built values synchronously, so blocking here is safe.
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
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-mcp-extensions-tests-").FullName;

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
