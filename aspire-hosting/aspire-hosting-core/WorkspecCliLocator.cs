namespace Aspire.Hosting.Workspec;

/// <summary>How to invoke a resolved workspec CLI: a command plus any args that must precede the caller's own.</summary>
public sealed record WorkspecCliInvocation(string Command, IReadOnlyList<string> ArgsPrefix)
{
    public WorkspecCliInvocation(string command) : this(command, [])
    {
    }
}

/// <summary>Resolution inputs for <see cref="WorkspecCliLocator.Resolve"/>.</summary>
public sealed class WorkspecCliLocatorOptions
{
    /// <summary>Explicit path/command override — wins over everything else when set.</summary>
    public string? ExplicitPath { get; init; }

    /// <summary>Directory whose <c>node_modules/.bin</c> is checked for a local install. Defaults to CWD.</summary>
    public string WorkingDirectory { get; init; } = Directory.GetCurrentDirectory();
}

/// <summary>
/// Resolves how to invoke a workspec module CLI (<c>workspec-c4</c>, <c>workspec-decisions</c>,
/// <c>workspec-cost</c>) without executing anything. Resolution order:
/// explicit path override → <c>WORKSPEC_CLI_&lt;NAME&gt;</c> env var → local
/// <c>node_modules/.bin/&lt;name&gt;</c> → bare command on PATH.
/// </summary>
public static class WorkspecCliLocator
{
    public static WorkspecCliInvocation Resolve(string cliName, WorkspecCliLocatorOptions? options = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cliName);
        options ??= new WorkspecCliLocatorOptions();

        if (!string.IsNullOrWhiteSpace(options.ExplicitPath))
        {
            return new WorkspecCliInvocation(options.ExplicitPath);
        }

        var envValue = Environment.GetEnvironmentVariable(EnvironmentVariableName(cliName));
        if (!string.IsNullOrWhiteSpace(envValue))
        {
            return new WorkspecCliInvocation(envValue);
        }

        var localBinName = OperatingSystem.IsWindows() ? $"{cliName}.cmd" : cliName;
        var localBinPath = Path.Combine(options.WorkingDirectory, "node_modules", ".bin", localBinName);
        if (File.Exists(localBinPath))
        {
            return new WorkspecCliInvocation(localBinPath);
        }

        return new WorkspecCliInvocation(cliName);
    }

    /// <summary>The env var name checked for a given CLI, e.g. <c>workspec-c4</c> → <c>WORKSPEC_CLI_C4</c>.</summary>
    public static string EnvironmentVariableName(string cliName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cliName);
        var suffix = cliName.StartsWith("workspec-", StringComparison.OrdinalIgnoreCase)
            ? cliName["workspec-".Length..]
            : cliName;
        return $"WORKSPEC_CLI_{suffix.Replace('-', '_').ToUpperInvariant()}";
    }
}
