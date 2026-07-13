using System.Text.Json.Serialization;

namespace Aspire.Hosting.Workspec;

// workspec-graph/v1 document model — see docs/aspire-hosting/graph-contract.md.
// JsonPropertyOrder pins serialization order explicitly rather than relying on
// reflection/declaration order, so byte-identical output is a contract, not luck.

/// <summary>The workspec-graph/v1 document: an apphost's resource model, serialized deterministically.</summary>
public sealed class WorkspecGraph
{
    [JsonPropertyOrder(0)]
    public string Version { get; init; } = "workspec-graph/v1";

    [JsonPropertyOrder(1)]
    public WorkspecApphost Apphost { get; init; } = new();

    [JsonPropertyOrder(2)]
    public IReadOnlyList<WorkspecResource> Resources { get; init; } = [];
}

public sealed class WorkspecApphost
{
    [JsonPropertyOrder(0)]
    public string Name { get; init; } = "";
}

public sealed class WorkspecResource
{
    [JsonPropertyOrder(0)]
    public string Name { get; init; } = "";

    /// <summary>One of <see cref="WorkspecResourceKind"/>. Never omitted — unmappable resources get "unknown".</summary>
    [JsonPropertyOrder(1)]
    public string Kind { get; init; } = WorkspecResourceKind.Unknown;

    /// <summary>CLR type short name — opaque classification hint for consumers, not parsed by this contract.</summary>
    [JsonPropertyOrder(2)]
    public string TypeName { get; init; } = "";

    [JsonPropertyOrder(3)]
    public string? Image { get; init; }

    [JsonPropertyOrder(4)]
    public string? Command { get; init; }

    [JsonPropertyOrder(5)]
    public string? WorkingDirectory { get; init; }

    [JsonPropertyOrder(6)]
    public IReadOnlyList<WorkspecEndpoint> Endpoints { get; init; } = [];

    [JsonPropertyOrder(7)]
    public string? Parent { get; init; }

    [JsonPropertyOrder(8)]
    public IReadOnlyList<WorkspecReference> References { get; init; } = [];

    /// <summary>Reserved string-&gt;string map. Always empty in v1 — future slices may populate it (additive, v2).</summary>
    [JsonPropertyOrder(9)]
    public IReadOnlyDictionary<string, string> Properties { get; init; } = new Dictionary<string, string>();
}

public sealed class WorkspecEndpoint
{
    [JsonPropertyOrder(0)]
    public string Name { get; init; } = "";

    [JsonPropertyOrder(1)]
    public string? Scheme { get; init; }

    [JsonPropertyOrder(2)]
    public int? Port { get; init; }

    [JsonPropertyOrder(3)]
    public int? TargetPort { get; init; }

    [JsonPropertyOrder(4)]
    public bool External { get; init; }
}

public sealed class WorkspecReference
{
    [JsonPropertyOrder(0)]
    public string Target { get; init; } = "";

    /// <summary>One of <see cref="WorkspecReferenceVia"/>.</summary>
    [JsonPropertyOrder(1)]
    public string Via { get; init; } = WorkspecReferenceVia.Unknown;

    [JsonPropertyOrder(2)]
    public string? Label { get; init; }
}

/// <summary>Closed set of <see cref="WorkspecResource.Kind"/> values (plain strings, not a JSON enum — kept opaque per contract).</summary>
public static class WorkspecResourceKind
{
    public const string Container = "container";
    public const string Executable = "executable";
    public const string Project = "project";
    public const string Parameter = "parameter";
    public const string Azure = "azure";
    public const string Unknown = "unknown";
}

/// <summary>Closed set of <see cref="WorkspecReference.Via"/> values.</summary>
public static class WorkspecReferenceVia
{
    public const string ConnectionString = "connection-string";
    public const string Endpoint = "endpoint";
    public const string Environment = "environment";
    public const string Wait = "wait";
    public const string Relationship = "relationship";
    public const string Unknown = "unknown";
}
