using System.Runtime.CompilerServices;

// The unit tests for the internal process-execution/parsing helpers below live in the existing
// aspire-hosting-tests project rather than a new one — see aspire-hosting/README.md's project
// layout. This grants that assembly access to this project's `internal` types/members.
[assembly: InternalsVisibleTo("Aspire.Hosting.Workspec.Tests")]
