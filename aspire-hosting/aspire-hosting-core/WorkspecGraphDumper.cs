using System.Text.Json;
using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting.Workspec;

/// <summary>
/// Pure producer of the workspec-graph/v1 document from an Aspire <see cref="DistributedApplicationModel"/>.
/// No I/O, no timestamps — same model in, byte-identical JSON out. See
/// docs/aspire-hosting/graph-contract.md for the schema and producer rules this implements.
/// </summary>
public static class WorkspecGraphDumper
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>
    /// Builds the graph document for <paramref name="model"/>.
    /// </summary>
    /// <param name="model">The built application model to walk.</param>
    /// <param name="apphostName">
    /// The apphost's application name (e.g. <c>builder.Environment.ApplicationName</c>). Not derivable
    /// from <see cref="DistributedApplicationModel"/> alone — <see cref="WorkspecGraphDumpExtensions.WithWorkspecGraphDump"/>
    /// supplies it from the builder. Defaults to "" for callers that only have the model.
    /// </param>
    public static WorkspecGraph Dump(DistributedApplicationModel model, string apphostName = "")
    {
        ArgumentNullException.ThrowIfNull(model);

        var resources = model.Resources
            .Select(BuildResource)
            .OrderBy(r => r.Name, StringComparer.Ordinal)
            .ToList();

        return new WorkspecGraph
        {
            Apphost = new WorkspecApphost { Name = apphostName },
            Resources = resources,
        };
    }

    /// <summary>Serializes a graph to the canonical deterministic JSON form.</summary>
    public static string Serialize(WorkspecGraph graph)
    {
        ArgumentNullException.ThrowIfNull(graph);
        return JsonSerializer.Serialize(graph, JsonOptions);
    }

    /// <summary>Convenience: dump and serialize in one call.</summary>
    public static string DumpToJson(DistributedApplicationModel model, string apphostName = "") =>
        Serialize(Dump(model, apphostName));

    private static WorkspecResource BuildResource(IResource resource)
    {
        var executable = resource as ExecutableResource;
        return new WorkspecResource
        {
            Name = resource.Name,
            Kind = ClassifyKind(resource),
            TypeName = resource.GetType().Name,
            Image = BuildImage(resource),
            Command = executable?.Command,
            WorkingDirectory = executable?.WorkingDirectory,
            Endpoints = ExtractEndpoints(resource),
            Parent = ResolveParent(resource),
            References = ExtractReferences(resource),
            Properties = new Dictionary<string, string>(),
        };
    }

    private static string ClassifyKind(IResource resource) => resource switch
    {
        ContainerResource => WorkspecResourceKind.Container,
        ExecutableResource => WorkspecResourceKind.Executable,
        ProjectResource => WorkspecResourceKind.Project,
        ParameterResource => WorkspecResourceKind.Parameter,
        _ when LooksLikeAzureResource(resource) => WorkspecResourceKind.Azure,
        _ => WorkspecResourceKind.Unknown,
    };

    // aspire-hosting-core only references Aspire.Hosting, not any Aspire.Hosting.Azure.* package,
    // so Azure resource types can't be checked via interface/type — this is a namespace/name
    // heuristic against whatever concrete IResource shows up in the model at dump time.
    private static bool LooksLikeAzureResource(IResource resource)
    {
        var type = resource.GetType();
        return type.Namespace?.Contains("Azure", StringComparison.Ordinal) == true
            || type.FullName?.Contains("Azure", StringComparison.Ordinal) == true;
    }

    private static string? BuildImage(IResource resource)
    {
        var annotation = resource.Annotations.OfType<ContainerImageAnnotation>().LastOrDefault();
        if (annotation?.Image is null)
        {
            return null;
        }

        var image = annotation.Image;
        if (annotation.Registry is not null)
        {
            image = $"{annotation.Registry}/{image}";
        }
        else if (!image.Contains('/'))
        {
            image = $"docker.io/library/{image}";
        }
        else if (!LooksLikeRegistryHost(image[..image.IndexOf('/')]))
        {
            image = $"docker.io/{image}";
        }

        if (annotation.SHA256 is not null)
        {
            return $"{image}@sha256:{annotation.SHA256}";
        }

        return annotation.Tag is not null ? $"{image}:{annotation.Tag}" : image;
    }

    private static bool LooksLikeRegistryHost(string hostSegment) =>
        hostSegment.Contains('.') || hostSegment.Contains(':') || hostSegment == "localhost";

    private static IReadOnlyList<WorkspecEndpoint> ExtractEndpoints(IResource resource) =>
        resource.Annotations.OfType<EndpointAnnotation>()
            .Select(e => new WorkspecEndpoint
            {
                Name = e.Name,
                Scheme = e.UriScheme,
                Port = e.Port,
                TargetPort = e.TargetPort,
                External = e.IsExternal,
            })
            .OrderBy(e => e.Name, StringComparer.Ordinal)
            .ToList();

    private static string? ResolveParent(IResource resource)
    {
        if (resource is IResourceWithParent withParent)
        {
            return withParent.Parent.Name;
        }

        // Some resources (e.g. AddResource(...).WithParentRelationship(...)) express parentage
        // only as a dashboard relationship annotation rather than IResourceWithParent.
        return resource.Annotations.OfType<ResourceRelationshipAnnotation>()
            .FirstOrDefault(r => r.Type == "Parent")
            ?.Resource.Name;
    }

    private static IReadOnlyList<WorkspecReference> ExtractReferences(IResource resource)
    {
        var edges = new List<(string Target, string Via, string? Label)>();

        foreach (var envAnnotation in resource.Annotations.OfType<EnvironmentCallbackAnnotation>())
        {
            foreach (var value in InvokeEnvironmentCallback(resource, envAnnotation))
            {
                foreach (var (target, via) in ResolveValue(value, WorkspecReferenceVia.Environment))
                {
                    if (!string.Equals(target, resource.Name, StringComparison.Ordinal))
                    {
                        edges.Add((target, via, null));
                    }
                }
            }
        }

        foreach (var argsAnnotation in resource.Annotations.OfType<CommandLineArgsCallbackAnnotation>())
        {
            foreach (var value in InvokeArgsCallback(resource, argsAnnotation))
            {
                // Seed via is "unknown", not "environment" — these values arrive on the command
                // line, so only the reference type itself can say something more specific
                // (EndpointReference → "endpoint", ConnectionStringReference → "connection-string").
                // Plain values (the usual string args) resolve to no resource and produce nothing.
                foreach (var (target, via) in ResolveValue(value, WorkspecReferenceVia.Unknown))
                {
                    if (!string.Equals(target, resource.Name, StringComparison.Ordinal))
                    {
                        edges.Add((target, via, null));
                    }
                }
            }
        }

        foreach (var wait in resource.Annotations.OfType<WaitAnnotation>())
        {
            edges.Add((wait.Resource.Name, WorkspecReferenceVia.Wait, null));
        }

        foreach (var relationship in resource.Annotations.OfType<ResourceRelationshipAnnotation>())
        {
            // "Reference"/"Parent"/"WaitFor" are Aspire's own dashboard-visualization mirrors of
            // signals we already capture more precisely above (env-callback walk, WaitAnnotation,
            // IResourceWithParent) — processing them too would double-count the same edge under a
            // second `via`. Only genuinely custom relationship types (e.g. "publishes-to" from a
            // user's .WithRelationship(...) call) become their own via="relationship" edge.
            if (relationship.Type is "Reference" or "Parent" or "WaitFor")
            {
                continue;
            }

            edges.Add((relationship.Resource.Name, WorkspecReferenceVia.Relationship, relationship.Type));
        }

        // Dedup includes Label so two distinct custom relationships to the same target (e.g.
        // "publishes-to" and "depends-on-custom") both survive — only true repeats collapse.
        return edges
            .GroupBy(e => (e.Target, e.Via, e.Label))
            .Select(g => new WorkspecReference { Target = g.Key.Target, Via = g.Key.Via, Label = g.Key.Label })
            .OrderBy(r => r.Target, StringComparer.Ordinal)
            .ThenBy(r => r.Via, StringComparer.Ordinal)
            .ThenBy(r => r.Label, StringComparer.Ordinal)
            .ToList();
    }

    // EnvironmentCallbackAnnotation.Callback is async (Func<EnvironmentCallbackContext, Task>), but every
    // first-party Aspire callback (WithReference, WithEnvironment, ...) only assigns already-built value
    // objects into the dictionary synchronously — no real I/O happens until something later calls
    // GetValueAsync on those objects, which we never do. Blocking here keeps Dump a synchronous pure
    // function; a hypothetical callback that awaits real I/O before assigning would stall this call.
    private static List<object> InvokeEnvironmentCallback(IResource resource, EnvironmentCallbackAnnotation annotation)
    {
        var executionContext = new DistributedApplicationExecutionContext(DistributedApplicationOperation.Run);
        var environmentVariables = new Dictionary<string, object>();
        var context = new EnvironmentCallbackContext(executionContext, resource, environmentVariables, CancellationToken.None);
        annotation.Callback(context).GetAwaiter().GetResult();
        return [.. environmentVariables.Values];
    }

    // Args mirror of InvokeEnvironmentCallback, with the same blocking rationale: first-party
    // WithArgs/AddExecutable callbacks only append already-built values (strings, EndpointReference,
    // ConnectionStringReference, ...) to the list synchronously — nothing calls GetValueAsync here.
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

    // Walks a resolved environment/args value down to the IResource(s) it references, tagging the edge
    // with the most specific `via` classification encountered along the way. Order of the pattern
    // match matters: IResource is checked before IValueWithReferences because some resources (e.g.
    // ConnectionStringResource) implement both — we want the resource itself as the edge target, not
    // a recursion into its own internal composition.
    private static IEnumerable<(string Target, string Via)> ResolveValue(object? value, string via, int depth = 0)
    {
        if (value is null || depth > 32)
        {
            yield break;
        }

        switch (value)
        {
            case IResource resource:
                yield return (resource.Name, via);
                break;

            case ConnectionStringReference connectionStringReference:
                foreach (var x in ResolveValue(connectionStringReference.Resource, WorkspecReferenceVia.ConnectionString, depth + 1))
                {
                    yield return x;
                }

                break;

            case EndpointReference endpointReference:
                foreach (var x in ResolveValue(endpointReference.Resource, WorkspecReferenceVia.Endpoint, depth + 1))
                {
                    yield return x;
                }

                break;

            case EndpointReferenceExpression endpointReferenceExpression:
                foreach (var x in ResolveValue(endpointReferenceExpression.Endpoint, WorkspecReferenceVia.Endpoint, depth + 1))
                {
                    yield return x;
                }

                break;

            case ReferenceExpression referenceExpression:
                foreach (var valueProvider in referenceExpression.ValueProviders)
                {
                    foreach (var x in ResolveValue(valueProvider, via, depth + 1))
                    {
                        yield return x;
                    }
                }

                break;

            case IValueWithReferences valueWithReferences:
                foreach (var reference in valueWithReferences.References)
                {
                    foreach (var x in ResolveValue(reference, via, depth + 1))
                    {
                        yield return x;
                    }
                }

                break;
        }
    }
}
