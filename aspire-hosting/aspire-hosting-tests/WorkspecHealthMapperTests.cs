using Aspire.Hosting.Workspec;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecHealthMapperTests
{
    [Theory]
    [InlineData(0, 0, HealthStatus.Healthy)]
    [InlineData(0, 1, HealthStatus.Degraded)]
    [InlineData(0, 5, HealthStatus.Degraded)]
    [InlineData(1, 0, HealthStatus.Unhealthy)]
    [InlineData(1, 3, HealthStatus.Unhealthy)]
    [InlineData(4, 0, HealthStatus.Unhealthy)]
    public void MapSeverity_ReturnsExpectedStatus(int errors, int warnings, HealthStatus expected)
    {
        Assert.Equal(expected, WorkspecHealthMapper.MapSeverity(errors, warnings));
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(0, -1)]
    public void MapSeverity_RejectsNegativeCounts(int errors, int warnings)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => WorkspecHealthMapper.MapSeverity(errors, warnings));
    }
}
