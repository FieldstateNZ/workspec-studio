using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Aspire.Hosting;

/// <summary>Opt-in health check that inspects <c>.workspec/</c> model diagnostics, not just liveness.</summary>
public static class WorkspecC4HealthCheckExtensions
{
    // One shared client across every poll of every registered check: a per-poll `new HttpClient()`
    // leaks sockets under churn, and HttpClient's default 100s timeout is far longer than any sane
    // health-probe budget — a wedged server would pin the health pipeline for the full 100s.
    private static readonly HttpClient SharedHttpClient = new() { Timeout = TimeSpan.FromSeconds(10) };

    /// <summary>
    /// Registers a named async health check that polls <c>GET {endpointName}/api/model</c> and maps
    /// the response's diagnostics-array error/warning counts to a <see cref="HealthStatus"/> via
    /// <see cref="WorkspecHealthMapper"/>. Unlike <see cref="WorkspecHealthCheckExtensions.WithWorkspecHealthCheck{T}"/>
    /// (which only checks that the studio server responds), this reflects whether the underlying
    /// <c>.workspec/</c> model itself is valid.
    /// </summary>
    /// <param name="builder">The workspec-c4 resource builder.</param>
    /// <param name="endpointName">The HTTP endpoint to poll (default <c>"http"</c>).</param>
    /// <returns>The resource builder, for chaining.</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecC4StudioResource> WithModelDiagnosticsHealthCheck(
        this IResourceBuilder<WorkspecC4StudioResource> builder,
        string endpointName = "http")
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(endpointName);

        // Captured once at registration time — the endpoint reference itself is a stable handle;
        // only its .IsAllocated/.Url are checked freshly on every poll.
        var endpoint = builder.Resource.GetEndpoint(endpointName);
        var key = $"{builder.Resource.Name}-model-diagnostics";

        builder.ApplicationBuilder.Services.AddHealthChecks().AddAsyncCheck(key, async () =>
        {
            if (!endpoint.IsAllocated)
            {
                return HealthCheckResult.Unhealthy($"Endpoint '{endpointName}' is not yet allocated.");
            }

            try
            {
                using var response = await SharedHttpClient.GetAsync(new Uri($"{endpoint.Url}/api/model")).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    return HealthCheckResult.Unhealthy($"GET /api/model returned {(int)response.StatusCode}.");
                }

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var (errorCount, warningCount) = WorkspecModelDiagnosticsParser.CountBySeverity(body);
                var status = WorkspecHealthMapper.MapSeverity(errorCount, warningCount);

                return new HealthCheckResult(status, $"{errorCount} error(s), {warningCount} warning(s) in .workspec model.");
            }
            catch (Exception ex)
            {
                // A bug in the check itself (HTTP failure, malformed JSON, connection refused, ...)
                // must never escape the health check delegate — report unhealthy, don't throw.
                return HealthCheckResult.Unhealthy($"GET /api/model failed: {ex.Message}");
            }
        });

        return builder.WithHealthCheck(key);
    }
}

/// <summary>
/// Parses a <c>workspec-c4 serve</c> <c>GET /api/model</c> response body into (errorCount,
/// warningCount) over its <c>diagnostics</c> array. Internal plumbing, factored out of the health
/// check delegate above so it's directly unit-testable without real HTTP.
/// </summary>
internal static class WorkspecModelDiagnosticsParser
{
    public static (int ErrorCount, int WarningCount) CountBySeverity(string modelJson)
    {
        ArgumentNullException.ThrowIfNull(modelJson);

        using var document = JsonDocument.Parse(modelJson);
        if (!document.RootElement.TryGetProperty("diagnostics", out var diagnostics) || diagnostics.ValueKind != JsonValueKind.Array)
        {
            return (0, 0);
        }

        var errorCount = 0;
        var warningCount = 0;

        foreach (var diagnostic in diagnostics.EnumerateArray())
        {
            if (!diagnostic.TryGetProperty("severity", out var severity) || severity.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            switch (severity.GetString())
            {
                case "error":
                    errorCount++;
                    break;
                case "warning":
                    warningCount++;
                    break;
            }
        }

        return (errorCount, warningCount);
    }
}
