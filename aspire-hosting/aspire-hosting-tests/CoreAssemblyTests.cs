using System.Reflection;
using System.Runtime.Versioning;

namespace Aspire.Hosting.Workspec.Tests;

public class CoreAssemblyTests
{
    // Bootstrap smoke test: Core loads as a real assembly named per
    // convention and actually targets net10.0 — proof the shared
    // Directory.Build.props settings flowed through the build, not just
    // "the solution compiles".
    [Fact]
    public void CoreAssembly_LoadsAndTargetsNet10()
    {
        var assembly = Assembly.Load("Aspire.Hosting.Workspec.Core");

        Assert.Equal("Aspire.Hosting.Workspec.Core", assembly.GetName().Name);

        var targetFramework = assembly.GetCustomAttribute<TargetFrameworkAttribute>();
        Assert.NotNull(targetFramework);
        Assert.Equal(".NETCoreApp,Version=v10.0", targetFramework!.FrameworkName);
    }
}
