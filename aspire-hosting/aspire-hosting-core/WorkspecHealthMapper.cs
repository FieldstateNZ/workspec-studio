using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Aspire.Hosting.Workspec;

/// <summary>
/// Maps workspec module diagnostics counts to .NET's <see cref="HealthStatus"/>. Parsing a module
/// CLI's actual diagnostics JSON into (errors, warnings) belongs to later slices (A3+) — this is
/// just the pure severity->status rule they'll all share.
/// </summary>
public static class WorkspecHealthMapper
{
    public static HealthStatus MapSeverity(int errorCount, int warningCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(errorCount);
        ArgumentOutOfRangeException.ThrowIfNegative(warningCount);

        if (errorCount > 0)
        {
            return HealthStatus.Unhealthy;
        }

        return warningCount > 0 ? HealthStatus.Degraded : HealthStatus.Healthy;
    }
}
