using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting;

/// <summary>Annotates a resource with the decision record that governs it.</summary>
public static class WithDecisionExtensions
{
    /// <summary>
    /// Marks <paramref name="builder"/>'s resource as governed by the decision <paramref name="decisionRef"/>
    /// served by <paramref name="decisions"/>: adds a labeled <c>"governed-by"</c> relationship edge
    /// (visible in the dashboard's resource graph) plus a per-resource dashboard URL into the Decision
    /// Studio explorer.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Deep-link limitation, documented deliberately:</b> <c>@workspec/decision-studio</c>'s client
    /// (<c>packages/decision-studio/client/main.tsx</c>) keeps the selected decision as local React
    /// state (<c>useState</c>) seeded by auto-selecting the first entry in <c>/api/decisions</c> — it
    /// never reads a route segment or a <c>?ref=</c> query parameter to pick which decision is shown.
    /// The Express host (<c>packages/decision-studio/src/server.ts</c>) does accept a
    /// <c>?ref=</c> query string, but only on its JSON API (<c>GET /api/decision?ref=...</c>), and its
    /// SPA-fallback route serves the same <c>index.html</c> for any non-API GET regardless of query
    /// string — so a URL like <c>{decisionsUrl}/?ref=&lt;ref&gt;</c> would silently load and ignore the
    /// ref, not 404. Rather than construct a URL that implies deep-linking capability the client
    /// doesn't have, the added URL always points at the explorer root; <paramref name="decisionRef"/>
    /// appears only in the link's display text, so the operator knows which decision to pick once the
    /// explorer loads. Revisit this once the client itself supports selecting a decision from the URL.
    /// </para>
    /// <para>
    /// The URL is built from <paramref name="decisions"/>' own allocated "http" endpoint (an
    /// <see cref="EndpointReference"/> embedded in an interpolated string, the same
    /// <c>ReferenceExpression</c>-based mechanism <c>WithEnvironment</c>/<c>WithUrl</c> use elsewhere
    /// in Aspire), never a hardcoded port — the underlying <c>WithUrl</c> call registers a
    /// <c>ResourceUrlsCallbackAnnotation</c> that resolves the endpoint's real address once endpoints
    /// have been allocated for <paramref name="builder"/>'s resource, i.e. at the same
    /// "BeforeResourceStarted"-ish time <c>WithUrlForEndpoint</c> resolves its own resource's
    /// endpoints (see aspire-hosting-c4's <c>AddWorkspecC4</c> for that sibling pattern).
    /// </para>
    /// </remarks>
    /// <typeparam name="T">The governed resource's type — any resource, not just ones with endpoints.</typeparam>
    /// <param name="builder">The resource builder for the governed resource.</param>
    /// <param name="decisions">The decisions studio resource that serves <paramref name="decisionRef"/>.</param>
    /// <param name="decisionRef">
    /// The governing decision's ref (repo-relative path to its <c>*.decision.yaml</c>), as understood
    /// by <c>workspec-decisions</c>. Not validated against the served directory at registration time —
    /// see <see cref="WorkspecDecisionsExtensions.AddWorkspecDecisions"/>'s "Render ADR" command for
    /// where an unresolvable ref is eventually surfaced.
    /// </param>
    /// <returns>The governed resource's builder, for further chaining.</returns>
    // Explicit export name: the ATS analyzer (ASPIREEXPORT009) rejects the default
    // camelCase-of-method-name ("withDecision") as a cross-integration collision risk because
    // the method is generic over any resource type while targeting a specific
    // IResourceBuilder<WorkspecDecisionsStudioResource> parameter; MethodName keeps the
    // TS-side call spelled `.withDecision(...)`.
    [AspireExport("withWorkspecDecisionsStudioDecision", MethodName = "withDecision")]
    public static IResourceBuilder<T> WithDecision<T>(
        this IResourceBuilder<T> builder,
        IResourceBuilder<WorkspecDecisionsStudioResource> decisions,
        string decisionRef)
        where T : IResource
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(decisions);
        ArgumentException.ThrowIfNullOrWhiteSpace(decisionRef);

        // Registration-order plumbing consumed by the "Render ADR" command's ref-resolution
        // fallback — see WorkspecDecisionsStudioResource.RegisteredDecisionRefs.
        decisions.Resource.RegisterDecisionRef(decisionRef);

        var decisionsEndpoint = decisions.GetEndpoint("http");

        return builder
            .WithRelationship(decisions.Resource, "governed-by")
            .WithUrl($"{decisionsEndpoint}", $"Decision: {decisionRef}");
    }
}
