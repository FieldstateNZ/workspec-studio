using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting.Workspec;

/// <summary>
/// Shared health-check registration for module integrations (A3+). Wraps Aspire's own
/// <c>WithHttpHealthCheck</c>/<c>IHealthChecksBuilder</c> machinery behind a single workspec entry
/// point, so later slices have one place to evolve (e.g. toward CLI-diagnostics-backed checks using
/// <see cref="WorkspecHealthMapper"/>) without every module integration changing its call site.
/// </summary>
public static class WorkspecHealthCheckExtensions
{
    /// <summary>
    /// Registers an HTTP health probe against <paramref name="endpointName"/> on this resource,
    /// hitting <paramref name="path"/> (default <c>/api/health</c>) and gating <c>WaitFor</c> on it.
    /// </summary>
    [AspireExportIgnore(Reason = "Thin wrapper over WithHttpHealthCheck; ATS export for this convenience helper is deferred until a module integration slice needs TypeScript AppHost support.")]
    public static IResourceBuilder<T> WithWorkspecHealthCheck<T>(
        this IResourceBuilder<T> builder,
        string endpointName,
        string path = "/api/health")
        where T : IResourceWithEndpoints
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(endpointName);
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        return builder.WithHttpHealthCheck(path, statusCode: null, endpointName: endpointName);
    }
}
