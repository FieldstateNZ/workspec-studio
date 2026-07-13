using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Builds the representative in-memory app model shared by the graph-dump tests: a container with an
/// endpoint, an executable that references a connection-string resource and waits on the container,
/// a parameter, and a parent relationship — no Run()/Docker involved, so this stays CI-fast.
/// </summary>
internal static class WorkspecGraphTestModel
{
    public const string ApphostName = "workspec-sample-apphost";

    // Fixed, non-machine-dependent path: ExecutableResource resolves relative working directories
    // against AppHostDirectory (which varies per machine/CI run), so an already-rooted path is what
    // keeps the fixture byte-exact across environments.
    public const string ApiWorkingDirectory = "/workspec-fixture/artifacts/api-server";

    public static (DistributedApplication App, DistributedApplicationModel Model) BuildRepresentativeModel()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });

        var param = builder.AddParameter("db-password", "supersecret", secret: true);

        var postgres = builder.AddContainer("postgres-enterprise", "postgres", "17")
            .WithEndpoint(name: "tcp", targetPort: 5432, port: 5432);

        var dbResource = new ConnectionStringResource(
            "workspec-db",
            ReferenceExpression.Create($"Host=postgres-enterprise;Password={param.Resource}"));
        var db = builder.AddResource(dbResource).WithParentRelationship(postgres);

        builder.AddExecutable("api-enterprise", "pnpm", ApiWorkingDirectory, "start")
            .WithHttpEndpoint(name: "http", targetPort: 6001, port: 6001)
            .WithExternalHttpEndpoints()
            .WithReference(db)
            .WaitFor(postgres);

        var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();
        return (app, model);
    }
}
