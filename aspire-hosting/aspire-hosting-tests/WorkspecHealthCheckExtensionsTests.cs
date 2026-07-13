using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecHealthCheckExtensionsTests
{
    [Fact]
    public void WithWorkspecHealthCheck_AttachesHealthCheckAnnotation_UsingDefaultPath()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var api = builder.AddExecutable("api", "pnpm", "/workspec-fixture", "start")
            .WithHttpEndpoint(name: "http", targetPort: 6001, port: 6001)
            .WithWorkspecHealthCheck("http");

        Assert.Contains(api.Resource.Annotations, a => a is HealthCheckAnnotation);
    }

    [Fact]
    public void WithWorkspecHealthCheck_AcceptsCustomPath()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var api = builder.AddExecutable("api", "pnpm", "/workspec-fixture", "start")
            .WithHttpEndpoint(name: "http", targetPort: 6001, port: 6001)
            .WithWorkspecHealthCheck("http", path: "/healthz");

        Assert.Contains(api.Resource.Annotations, a => a is HealthCheckAnnotation);
    }

    [Fact]
    public void WithWorkspecHealthCheck_OnNonHttpEndpoint_Throws()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var api = builder.AddExecutable("api", "pnpm", "/workspec-fixture", "start")
            .WithEndpoint(name: "tcp", targetPort: 6001, port: 6001);

        Assert.Throws<DistributedApplicationException>(() => api.WithWorkspecHealthCheck("tcp"));
    }
}
