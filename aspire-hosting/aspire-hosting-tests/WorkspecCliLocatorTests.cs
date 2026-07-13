using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecCliLocatorTests
{
    private const string EnvVarName = "WORKSPEC_CLI_C4";

    [Fact]
    public void Resolve_WithNoOverridesPresent_FallsBackToBareCommandOnPath()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Clear(EnvVarName);

        var result = WorkspecCliLocator.Resolve("workspec-c4", new WorkspecCliLocatorOptions { WorkingDirectory = scope.Path });

        Assert.Equal("workspec-c4", result.Command);
        Assert.Empty(result.ArgsPrefix);
    }

    [Fact]
    public void Resolve_WithLocalNodeModulesBin_PrefersItOverBareCommand()
    {
        using var scope = new TempDirectory();
        using var env = EnvVarScope.Clear(EnvVarName);
        var binPath = scope.CreateFakeLocalBin("workspec-c4");

        var result = WorkspecCliLocator.Resolve("workspec-c4", new WorkspecCliLocatorOptions { WorkingDirectory = scope.Path });

        Assert.Equal(binPath, result.Command);
    }

    [Fact]
    public void Resolve_WithEnvVar_PrefersItOverLocalNodeModulesBin()
    {
        using var scope = new TempDirectory();
        scope.CreateFakeLocalBin("workspec-c4");
        using var env = EnvVarScope.Set(EnvVarName, "/opt/tools/workspec-c4-custom");

        var result = WorkspecCliLocator.Resolve("workspec-c4", new WorkspecCliLocatorOptions { WorkingDirectory = scope.Path });

        Assert.Equal("/opt/tools/workspec-c4-custom", result.Command);
    }

    [Fact]
    public void Resolve_WithExplicitPath_WinsOverEverything()
    {
        using var scope = new TempDirectory();
        scope.CreateFakeLocalBin("workspec-c4");
        using var env = EnvVarScope.Set(EnvVarName, "/opt/tools/workspec-c4-custom");

        var result = WorkspecCliLocator.Resolve(
            "workspec-c4",
            new WorkspecCliLocatorOptions { WorkingDirectory = scope.Path, ExplicitPath = "/explicit/workspec-c4" });

        Assert.Equal("/explicit/workspec-c4", result.Command);
    }

    [Theory]
    [InlineData("workspec-c4", "WORKSPEC_CLI_C4")]
    [InlineData("workspec-decisions", "WORKSPEC_CLI_DECISIONS")]
    [InlineData("workspec-cost", "WORKSPEC_CLI_COST")]
    [InlineData("standalone-tool", "WORKSPEC_CLI_STANDALONE_TOOL")]
    public void EnvironmentVariableName_FollowsWorkspecCliConvention(string cliName, string expected)
    {
        Assert.Equal(expected, WorkspecCliLocator.EnvironmentVariableName(cliName));
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("workspec-cli-locator-tests-").FullName;

        public string CreateFakeLocalBin(string cliName)
        {
            var binDir = System.IO.Path.Combine(Path, "node_modules", ".bin");
            Directory.CreateDirectory(binDir);
            var binName = OperatingSystem.IsWindows() ? $"{cliName}.cmd" : cliName;
            var binPath = System.IO.Path.Combine(binDir, binName);
            File.WriteAllText(binPath, "#!/bin/sh\necho fake\n");
            return binPath;
        }

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }

    // Environment variables are process-global, so tests that touch WORKSPEC_CLI_* restore the
    // prior value on dispose rather than leaking state across [Fact]s (xunit doesn't guarantee
    // isolation between them within a collection).
    private sealed class EnvVarScope : IDisposable
    {
        private readonly string _name;
        private readonly string? _previousValue;

        private EnvVarScope(string name)
        {
            _name = name;
            _previousValue = Environment.GetEnvironmentVariable(name);
        }

        public static EnvVarScope Clear(string name)
        {
            var scope = new EnvVarScope(name);
            Environment.SetEnvironmentVariable(name, null);
            return scope;
        }

        public static EnvVarScope Set(string name, string value)
        {
            var scope = new EnvVarScope(name);
            Environment.SetEnvironmentVariable(name, value);
            return scope;
        }

        public void Dispose() => Environment.SetEnvironmentVariable(_name, _previousValue);
    }
}
