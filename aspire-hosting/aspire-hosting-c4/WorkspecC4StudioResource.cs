namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// An executable resource that runs the <c>workspec-c4</c> CLI's local host (<c>workspec-c4 serve</c>),
/// exposing the C4 model explorer for the apphost's <c>.workspec/</c> tree.
/// </summary>
/// <remarks>
/// <see cref="WorkspecDirectory"/> is a plain CLR property, not an ATS-exposed capability (this type
/// doesn't set <c>ExposeProperties = true</c>) — it exists so extension methods that only receive an
/// <see cref="IResourceBuilder{T}"/> of this resource (the health check, the dashboard commands,
/// <c>WithGraphSync</c>) can recover the resolved <c>.workspec/</c> directory via
/// <c>builder.Resource.WorkspecDirectory</c> without it being re-passed as a parameter everywhere.
/// </remarks>
[AspireExport]
public sealed class WorkspecC4StudioResource(string name, string command, string workingDirectory, string workspecDirectory)
    : ExecutableResource(name, command, workingDirectory)
{
    /// <summary>The resolved, absolute <c>.workspec/</c> directory this resource serves.</summary>
    public string WorkspecDirectory { get; } = workspecDirectory;
}

/// <summary>The mode <see cref="WorkspecGraphSyncExtensions.WithGraphSync"/> runs <c>workspec-c4 import-aspire</c> in.</summary>
public enum WorkspecGraphSyncMode
{
    /// <summary>Write/update the <c>.workspec/</c> tree to match the apphost graph.</summary>
    Scaffold,

    /// <summary>Report drift between the apphost graph and <c>.workspec/</c> without writing anything.</summary>
    Check,
}
