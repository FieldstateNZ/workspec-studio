# workspec-graph/v1

The contract between `Aspire.Hosting.Workspec.Core`'s graph-dump serializer (this repo,
`aspire-hosting/aspire-hosting-core`) and its TypeScript-side consumers. An Aspire apphost dumps
its `DistributedApplicationModel` to this JSON shape; the TypeScript side reads it to seed
`.workspec/` artifacts from the real running topology instead of a hand-maintained tree. Every
side links here as the canonical reference — don't let any consumer's README quietly drift from
what's written below.

Two independent consumers exist, each projecting the same graph into a different WorkSpec family:

- `workspec-c4 import-aspire` (`packages/c4-studio`, A2) — projects into a `.workspec/` C4 tree.
  Its full mapping rules are normatively specified in
  [`import-mapping.md`](./import-mapping.md).
- `@workspec/topology-adapters`' `aspire` import adapter (topology v0.1 S2a,
  workspec-studio#105) — projects into Topology `Resource`/`Connection` artifacts. Its mapping
  rules are documented in that package's own README and `aspire/aspire-adapter.ts` doc comment
  (not `import-mapping.md`, which is C4-specific).

## Schema

```jsonc
{
  "version": "workspec-graph/v1",
  "apphost": { "name": "<application name>" },
  "resources": [
    {
      "name": "api-enterprise",              // Aspire resource name — unique key, sort key
      "kind": "container | executable | project | parameter | azure | unknown",
      "typeName": "PostgresServerResource",  // CLR type short name, opaque classification hint
      "image": "docker.io/library/postgres:17",     // or null
      "command": "pnpm",                     // executables only, else null
      "workingDirectory": "/workspec-fixture/artifacts/api-server", // or null
      "endpoints": [
        { "name": "http", "scheme": "http", "port": 6001, "targetPort": 6001, "external": true }
      ],
      "parent": "postgres-enterprise",       // resource name, or null
      "references": [                        // sorted by (target, via, label)
        { "target": "workspec-db", "via": "connection-string | endpoint | environment | wait | relationship | unknown", "label": null }
      ],
      "properties": {}                       // reserved string→string map, always empty in v1
    }
  ]
}
```

`resources` is sorted by `name` (ordinal); each resource's `endpoints` by `name`, `references` by
`(target, via, label)`. No timestamps or other non-reproducible fields appear anywhere — the same
`DistributedApplicationModel` always serializes to byte-identical JSON (same philosophy as this
repo's deterministic SVG rendering in `@workspec/c4-ui`).

## Producer: `Aspire.Hosting.Workspec.WorkspecGraphDumper`

```csharp
public static class WorkspecGraphDumper
{
    // apphostName isn't derivable from DistributedApplicationModel alone (see Deviations below) —
    // defaults to "" so the single-arg call this contract originally specified still compiles.
    public static WorkspecGraph Dump(DistributedApplicationModel model, string apphostName = "");
    public static string Serialize(WorkspecGraph graph);
    public static string DumpToJson(DistributedApplicationModel model, string apphostName = "");
}

public static class WorkspecGraphDumpExtensions
{
    // Subscribes to AfterResourcesCreatedEvent and writes the dump to `path` — run mode only.
    // A relative `path` resolves against builder.AppHostDirectory, not the process CWD (which for
    // an apphost launched by an IDE or a `dotnet run` wrapper isn't predictable). Dump/write
    // failures are logged (ILogger, error level) and swallowed — the dump is a diagnostic
    // side-effect and must never fault orchestration after resources are already running.
    public static IDistributedApplicationBuilder WithWorkspecGraphDump(this IDistributedApplicationBuilder builder, string path);
}
```

### `kind` classification

| Aspire shape                                   | `kind`       |
| ----------------------------------------------- | ------------ |
| `ContainerResource`                             | `container`  |
| `ExecutableResource`                             | `executable` |
| `ProjectResource` (direct type check)            | `project`    |
| `ParameterResource` (and subtypes)               | `parameter`  |
| CLR namespace/type name contains `"Azure"`       | `azure`      |
| anything else                                    | `unknown`    |

`aspire-hosting-core` only references the `Aspire.Hosting` package, not any `Aspire.Hosting.Azure.*`
integration package, so Azure resource types can't be checked by interface or type — `azure` is a
best-effort namespace/name heuristic against whatever concrete `IResource` shows up in the model at
dump time. **Resources are never dropped for being unclassifiable** — an unrecognized type still
appears with `kind: "unknown"` and its real CLR type name in `typeName`.

### `image`

From the resource's `ContainerImageAnnotation` (last one wins if more than one is present), else
`null`. Normalized like a Docker image reference: an explicit `Registry` is prepended as-is; a bare
image name (no `/`) gets `docker.io/library/` prepended; an `org/image` form with no
registry-looking first segment (no `.`, no `:`, not `localhost`) gets `docker.io/` prepended. A
`SHA256` digest annotation wins over `Tag` if both are present (`@sha256:<digest>` vs `:<tag>`).

### `command` / `workingDirectory`

`ExecutableResource.Command` / `.WorkingDirectory` for executables, `null` for every other kind —
including containers, even though `ContainerResource` has its own `Entrypoint`. **Emitted as-is**:
`ExecutableResource.WorkingDirectory` is whatever Aspire resolved it to (see Deviations — this is
usually an absolute, machine-local path, not the relative string an apphost author wrote).

### `endpoints`

One entry per `EndpointAnnotation` on the resource: `name`/`scheme` (`UriScheme`)/`port`/
`targetPort`/`external` (`IsExternal`), sorted by `name`. Allocated (runtime) ports are never used —
only the design-time `Port`/`TargetPort` values, which is what keeps dumps deterministic before a
resource has even started.

### `parent`

`IResourceWithParent.Parent.Name` if the resource implements it, else the target of a
`ResourceRelationshipAnnotation` whose `Type` is `"Parent"` (what `.WithParentRelationship(...)`
attaches), else `null`.

### `references` — edge detection and `via` classification

Only **annotation-sourced** signals are walked (per this contract) — a resource's own typed
properties that happen to reference other resources (e.g. `IResourceWithConnectionString.
ConnectionStringExpression` on the referenced resource itself) are not. Four annotation kinds
produce edges:

1. **`EnvironmentCallbackAnnotation`** (added by `WithReference`/`WithEnvironment`/service-discovery
   wiring). The callback is invoked with a synthetic `EnvironmentCallbackContext` (a fresh
   `Dictionary<string, object>`, `DistributedApplicationOperation.Run`) — safe because every
   first-party Aspire callback only *assigns* an already-built value object into the dictionary
   synchronously; nothing calls `GetValueAsync` on the result, so no real I/O, Docker, or endpoint
   allocation is required. Each resulting value is walked recursively:
   - `ConnectionStringReference` → target is its `.Resource`, `via: "connection-string"`.
   - `EndpointReference` / `EndpointReferenceExpression` → target is the endpoint's owning
     resource, `via: "endpoint"`.
   - `ReferenceExpression` → recurse into each of its `ValueProviders`, keeping whatever `via` the
     recursion is already carrying (it's just a composite of the other cases, e.g. a connection
     string interpolating an endpoint host and a parameter).
   - A bare `IResource` (e.g. a `ParameterResource` passed directly to `WithEnvironment`) →
     `via: "environment"`.
   - Any other `IValueWithReferences` → recurse into `.References` (forward-compatible with future
     Aspire value-provider types this contract doesn't know about by name).
2. **`CommandLineArgsCallbackAnnotation`** (added by `WithArgs`/`AddExecutable`'s trailing args).
   The callback is invoked with a synthetic `CommandLineArgsCallbackContext` (a fresh
   `List<object>`, the resource, `DistributedApplicationOperation.Run`) — same blocking rationale
   as the environment walk: first-party callbacks only *append* already-built values to the list
   synchronously. Each appended value is walked with the same recursion as environment values,
   except the fallback `via` is `"unknown"` rather than `"environment"` — a command-line value can
   only be classified by its reference type (`EndpointReference`/`EndpointReferenceExpression` →
   `via: "endpoint"`, `ConnectionStringReference` → `via: "connection-string"`, composites recurse
   as usual). So `worker.WithArgs(ctx => ctx.Args.Add(backend.GetEndpoint("http")))` produces
   `{ target: "backend", via: "endpoint" }`, while plain values (the usual string args, which
   resolve to no resource) produce nothing.
3. **`WaitAnnotation`** (added by `WaitFor`/`WaitForStart`/`WaitForCompletion`) → `via: "wait"`.
4. **`ResourceRelationshipAnnotation`** with a `Type` other than `"Reference"`, `"Parent"`, or
   `"WaitFor"` → `via: "relationship"`, `label` set to the relationship's `Type` string.

   Those three built-in types are Aspire's own dashboard-visualization mirrors of signals already
   captured above (`WithReference` attaches both an `EnvironmentCallbackAnnotation` *and* a
   `"Reference"`-typed relationship annotation for the same edge; `WaitFor` attaches both a
   `WaitAnnotation` and a `"WaitFor"`-typed one; parentage is handled by the `parent` field).
   Processing them too would double-emit the same edge under a second `via`. Only genuinely custom
   relationship types — e.g. `.WithRelationship(resource, "publishes-to")` — become their own
   `via: "relationship"` edge. This is a documented interpretation of "relationship annotations" in
   the producer rule, not a schema change; see Deviations.

Edges are deduped on **`(target, via, label)`** and sorted by `(target, via, label)` (`label: null`
sorts before any string). Including `label` in the dedup key means two *distinct* custom
relationships to the same target — e.g. `.WithRelationship(b, "publishes-to")` and
`.WithRelationship(b, "depends-on-custom")` — each survive as their own edge; only true repeats of
the same `(target, via, label)` triple collapse to one.

## Versioning stance

**v1 is frozen once A2 (`workspec-c4 import-aspire`) merges and consumes it.** Any change that
would break an existing consumer — renaming/removing a field, changing a `kind`/`via` value's
meaning, changing sort order or the "never drop a resource" guarantee — is a **v2**, a new
`version` string, and a new doc section here, not an in-place edit of v1. Purely additive changes
(a new optional field, a new `kind`/`via` value alongside the existing ones) are the only changes
that may land as v1 without a version bump, and even those should be called out in this doc's
change history before A2 depends on them.

## Deviations from the original slice brief

Recorded here rather than silently changed, per A1's own instructions:

- **`Dump`'s signature takes an optional `apphostName` parameter.** The brief's exact form
  (`WorkspecGraphDumper.Dump(DistributedApplicationModel)`) can't produce `apphost.name` —
  `DistributedApplicationModel` only exposes `Resources`, nothing about the apphost itself. The
  builder extension (`WithWorkspecGraphDump`) supplies `builder.Environment.ApplicationName`; a
  caller with only a model gets `""`. The single-arg call form still compiles.
- **`WithWorkspecGraphDump` subscribes via `builder.Eventing.Subscribe<AfterResourcesCreatedEvent>`,
  not `builder.OnAfterResourcesCreated(...)`.** The latter, shown in the Aspire eventing docs, isn't
  present on `IDistributedApplicationBuilder` in the pinned `Aspire.Hosting 13.4.6` package (verified
  by reflecting the installed assembly) — `Eventing.Subscribe<T>` is the underlying eventing-model
  API it would have called, and is what's documented as the "lower-level" equivalent.
- **`workingDirectory` is emitted exactly as `ExecutableResource.WorkingDirectory` reports it**,
  which is an absolute path resolved against the apphost's directory at resource-creation time —
  not the relative string (`../artifacts/api-server`-style) an apphost author may have written, and
  not something `Dump` can reconstruct from the model alone (it has no `AppHostDirectory` to
  relativize against). The schema's illustrative value above uses a fixed absolute path for the
  same reason the fixture does (see Tests) — real dumps will show whatever absolute path Aspire
  resolved.
- **`ResourceRelationshipAnnotation` handling is narrower than "plus... relationship annotations"
  reads literally** — see the `references` section above. Built-in `"Reference"`/`"Parent"`/
  `"WaitFor"` relationship types are treated as duplicate signal, not additional edges, so that the
  common `WithReference` path produces exactly one `references` entry per target (matching this
  doc's own schema example) rather than two.

## Tests

`aspire-hosting-tests/WorkspecGraphDumperTests.cs` builds a representative model in-memory
(`DistributedApplication.CreateBuilder` — no `Run()`, no Docker) — a container with an endpoint, an
executable that references a connection-string resource and waits on the container, a parameter,
and a parent relationship — and asserts the dump byte-matches
`aspire-hosting-tests/Fixtures/workspec-graph-v1.sample.json`. The executable's working directory
is a fixed absolute path (`/workspec-fixture/artifacts/api-server`) rather than a relative one
specifically so the fixture stays byte-identical across machines/CI (see the `workingDirectory`
deviation above). Separate tests cover: two dumps of the same model are byte-identical; a custom
resource type with no recognized `kind` still appears (`kind: "unknown"`), never dropped; a
`ProjectResource` classifies as `kind: "project"`; two distinct custom relationships to the same
target both survive dedup; a `WithArgs`-sourced `EndpointReference` produces a `via: "endpoint"`
edge while plain string args produce none.
