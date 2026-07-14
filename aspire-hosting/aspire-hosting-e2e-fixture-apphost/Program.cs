using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);
builder.Build().Run();

// Exposes the top-level-statement-generated Program class so
// DistributedApplicationTestingBuilder.CreateAsync<Program>() can reference it from the test project
// (same pattern ASP.NET Core minimal APIs use for WebApplicationFactory<Program>).
public partial class Program;
