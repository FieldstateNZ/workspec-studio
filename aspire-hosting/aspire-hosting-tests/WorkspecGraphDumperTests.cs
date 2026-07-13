using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;
using Microsoft.Extensions.DependencyInjection;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecGraphDumperTests
{
    // Byte-exact snapshot: container + executable + reference + endpoint + parameter + wait +
    // parent relationship, dumped and compared verbatim against a committed fixture. Any
    // intentional shape change to WorkspecGraphDumper's output must update this fixture deliberately.
    [Fact]
    public void Dump_OfRepresentativeModel_MatchesCommittedFixture()
    {
        var (app, model) = WorkspecGraphTestModel.BuildRepresentativeModel();
        using (app)
        {
            var actual = WorkspecGraphDumper.DumpToJson(model, WorkspecGraphTestModel.ApphostName);

            var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "workspec-graph-v1.sample.json");
            var expected = File.ReadAllText(fixturePath);

            Assert.Equal(expected, actual);
        }
    }

    [Fact]
    public void Dump_CalledTwiceOnSameModel_IsByteIdentical()
    {
        var (app, model) = WorkspecGraphTestModel.BuildRepresentativeModel();
        using (app)
        {
            var first = WorkspecGraphDumper.DumpToJson(model, WorkspecGraphTestModel.ApphostName);
            var second = WorkspecGraphDumper.DumpToJson(model, WorkspecGraphTestModel.ApphostName);

            Assert.Equal(first, second);
        }
    }

    [Fact]
    public void Dump_NeverDropsAResource_EvenWhenKindIsUnrecognized()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddResource(new MysteryResource("mystery-thing"));

        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var graph = WorkspecGraphDumper.Dump(model);

        var resource = Assert.Single(graph.Resources);
        Assert.Equal("mystery-thing", resource.Name);
        Assert.Equal(WorkspecResourceKind.Unknown, resource.Kind);
        Assert.Equal(nameof(MysteryResource), resource.TypeName);
    }

    // Regression: dedup used to key on (target, via) only, so the second of two distinct custom
    // relationships to the same target was silently dropped. Label is part of the dedup key.
    [Fact]
    public void Dump_TwoDistinctCustomRelationshipsToSameTarget_KeepsBothEdges()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var backend = builder.AddContainer("backend", "nginx");
        builder.AddContainer("frontend", "nginx")
            .WithRelationship(backend, "publishes-to")
            .WithRelationship(backend, "depends-on-custom");

        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var graph = WorkspecGraphDumper.Dump(model);

        var frontend = Assert.Single(graph.Resources, r => r.Name == "frontend");
        Assert.Collection(
            frontend.References,
            first =>
            {
                Assert.Equal("backend", first.Target);
                Assert.Equal(WorkspecReferenceVia.Relationship, first.Via);
                Assert.Equal("depends-on-custom", first.Label);
            },
            second =>
            {
                Assert.Equal("backend", second.Target);
                Assert.Equal(WorkspecReferenceVia.Relationship, second.Via);
                Assert.Equal("publishes-to", second.Label);
            });
    }

    // Regression: ExtractReferences used to walk only EnvironmentCallbackAnnotation, so a reference
    // passed via WithArgs (CommandLineArgsCallbackAnnotation) produced zero edges. The plain string
    // args on the same resource ("run" from AddExecutable) must still produce nothing — hence the
    // Single assertion rather than Contains.
    [Fact]
    public void Dump_ArgsCallbackEndpointReference_ProducesEndpointEdge()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        var backend = builder.AddContainer("backend", "nginx")
            .WithHttpEndpoint(name: "http", targetPort: 8080);
        builder.AddExecutable("worker", "node", "/workspec-fixture/worker", "run")
            .WithArgs(context => context.Args.Add(backend.GetEndpoint("http")));

        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var graph = WorkspecGraphDumper.Dump(model);

        var worker = Assert.Single(graph.Resources, r => r.Name == "worker");
        var reference = Assert.Single(worker.References);
        Assert.Equal("backend", reference.Target);
        Assert.Equal(WorkspecReferenceVia.Endpoint, reference.Via);
        Assert.Null(reference.Label);
    }

    // ClassifyKind pattern-matches ExecutableResource before ProjectResource — this pins that
    // ProjectResource (which derives from Resource, not ExecutableResource) still lands on "project".
    [Fact]
    public void Dump_ProjectResource_ClassifiesAsProject()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [] });
        builder.AddResource(new ProjectResource("api-project"));

        using var app = builder.Build();
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();

        var graph = WorkspecGraphDumper.Dump(model);

        var resource = Assert.Single(graph.Resources, r => r.Name == "api-project");
        Assert.Equal(WorkspecResourceKind.Project, resource.Kind);
        Assert.Equal(nameof(ProjectResource), resource.TypeName);
    }

    [Fact]
    public void Dump_ProducesNoTimestampFields()
    {
        var (app, model) = WorkspecGraphTestModel.BuildRepresentativeModel();
        using (app)
        {
            var json = WorkspecGraphDumper.DumpToJson(model, WorkspecGraphTestModel.ApphostName);

            Assert.DoesNotContain("Timestamp", json, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("DateTime", json, StringComparison.OrdinalIgnoreCase);
        }
    }

    // A minimal custom resource (per Aspire's "Build custom Aspire resources" pattern) that doesn't
    // match any of container/executable/project/parameter/azure — exercises the "unknown, never
    // dropped" classification rule.
    private sealed class MysteryResource(string name) : Resource(name);
}
