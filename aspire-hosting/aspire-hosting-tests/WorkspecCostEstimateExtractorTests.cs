using Aspire.Hosting;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecCostEstimateExtractorTests
{
    [Fact]
    public void ExtractArmResources_WithFlatSkuObject_ExtractsNameTierAndCapacity()
    {
        const string bicep = """
            resource ns 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
              name: 'ns'
              location: location
              sku: {
                name: 'Premium'
                tier: 'Premium'
                capacity: 2
              }
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("bus", bicep);

        var resource = Assert.Single(resources);
        Assert.Equal("bus", resource.AspireResourceName);
        Assert.Equal("ns", resource.BicepSymbol);
        Assert.Equal("Microsoft.ServiceBus/namespaces", resource.Type);
        Assert.Equal("2022-10-01-preview", resource.ApiVersion);
        Assert.NotNull(resource.Sku);
        Assert.Equal("Premium", resource.Sku!.Name);
        Assert.Equal("Premium", resource.Sku!.Tier);
        Assert.Equal(2, resource.Sku!.Capacity);
    }

    [Fact]
    public void ExtractArmResources_WithSkuNameOnly_LeavesTierAndCapacityNull()
    {
        const string bicep = """
            resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' = {
              name: take('storage${uniqueString(resourceGroup().id)}', 24)
              kind: 'StorageV2'
              location: location
              sku: {
                name: 'Standard_GRS'
              }
              properties: {
                accessTier: 'Hot'
              }
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("storage", bicep);

        var resource = Assert.Single(resources);
        Assert.Equal("Standard_GRS", resource.Sku!.Name);
        Assert.Null(resource.Sku!.Tier);
        Assert.Null(resource.Sku!.Capacity);
    }

    [Fact]
    public void ExtractArmResources_WithBareStringSku_ExtractsItAsName()
    {
        const string bicep = """
            resource plan 'Microsoft.Web/serverfarms@2022-03-01' = {
              name: 'plan'
              location: location
              sku: 'B1'
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("web", bicep);

        var resource = Assert.Single(resources);
        Assert.Equal("B1", resource.Sku!.Name);
        Assert.Null(resource.Sku!.Tier);
        Assert.Null(resource.Sku!.Capacity);
    }

    [Fact]
    public void ExtractArmResources_WithNoSku_ReturnsNullSku()
    {
        // Microsoft.Sql/servers is a genuinely SKU-less ARM type (SKUs live on the child
        // databases/elastic pools, not the logical server) — unlike e.g. Key Vault, which DOES
        // carry a sku ({ family: 'A', name: 'standard' }) and would be a misleading fixture here.
        const string bicep = """
            resource sql 'Microsoft.Sql/servers@2021-11-01' = {
              name: 'sql'
              location: location
              properties: {
                administratorLogin: adminLogin
              }
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("sql", bicep);

        var resource = Assert.Single(resources);
        Assert.Null(resource.Sku);
    }

    // B2 regression (adversarial review): a sku block whose every field is a parameter reference
    // rather than a literal — the real shape AddAzureServiceBus generates by default — must be
    // recorded as UNKNOWN (null), not as a hollow CostEstimateSku(null, null, null), so the
    // artifact summary's unknownSkuCount counts it.
    [Fact]
    public void ExtractArmResources_WithFullyParameterizedSku_ReturnsNullSku()
    {
        const string bicep = """
            param sku string = 'Standard'

            resource sb 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
              name: take('sb-${uniqueString(resourceGroup().id)}', 50)
              location: location
              properties: {
                disableLocalAuth: true
              }
              sku: {
                name: sku
              }
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("sb", bicep);

        var resource = Assert.Single(resources);
        Assert.Equal("Microsoft.ServiceBus/namespaces", resource.Type);
        Assert.Null(resource.Sku);
    }

    [Fact]
    public void ExtractArmResources_ExcludesRoleAssignmentDeclarations()
    {
        const string bicep = """
            resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
              name: storage_outputs_name
            }

            resource storage_StorageBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
              name: guid(storage.id, principalId, subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'))
              properties: {
                principalId: principalId
              }
              scope: storage
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("storage-roles", bicep);

        Assert.DoesNotContain(resources, r => r.Type.StartsWith("Microsoft.Authorization/", StringComparison.Ordinal));
    }

    [Fact]
    public void ExtractArmResources_WithMultipleDeclarations_ExtractsEachIndependently()
    {
        const string bicep = """
            resource ns 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
              name: 'ns'
              sku: {
                name: 'Standard'
              }
            }

            resource queue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
              parent: ns
              name: 'orders'
              properties: {
                lockDuration: 'PT1M'
              }
            }
            """;

        var resources = WorkspecCostEstimateExtractor.ExtractArmResources("bus", bicep);

        Assert.Equal(2, resources.Count);
        Assert.Contains(resources, r => r.Type == "Microsoft.ServiceBus/namespaces" && r.Sku!.Name == "Standard");
        Assert.Contains(resources, r => r.Type == "Microsoft.ServiceBus/namespaces/queues" && r.Sku == null);
    }
}
