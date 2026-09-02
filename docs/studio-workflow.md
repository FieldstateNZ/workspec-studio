# Connected Studio workflow

WorkSpec Studio turns an application design into a reviewable infrastructure decision without
moving the source of truth out of `.workspec` files. Open `/studio/design` to start a new workspace,
or choose **Import .workspec ZIP** on the landing page or in the Studio sidebar.

## Human workflow

1. **Design** — use the infinite C4 canvas, add deployable containers/databases/queues, and save layout changes.
2. **Infrastructure** — review the requirements derived from those deployable elements. Edit size, quantity, and availability; actors and external systems are deliberately excluded.
3. **Compare** — compare Azure and AWS mappings against exactly the same requirements. Prices are deterministic planning estimates, not live quotations.
4. **Decision** — select a provider, edit the rationale, generate the ADR, and download the ZIP.

Import is lossless for everything below `.workspec/`, including files Studio does not understand
and binary evidence. A ZIP without C4 files keeps its existing content and receives a starter C4
model, so cost-only or decision-only workspaces can enter the same flow.

## Generated artifacts

The browser workspace contains the authored C4 tree plus:

```text
.workspec/
├── plans/infrastructure.yaml
├── environments/{dev,prod}.yaml
├── resources/*.yaml
├── topologies/{azure|aws}.yaml
├── decisions/catalogs/{azure|aws}.yaml
└── decisions/cloud-platform.yaml
```

The infrastructure plan is provider-neutral and retains `realizes` links back to C4 element slugs.
Only the accepted provider is materialized as resources, pricing catalog, and topology. The ADR
references all three outputs and records the other provider as the considered alternative.

## WebMCP workflow

In a browser that supports the imperative WebMCP API, Studio exposes six page-scoped tools:

| Tool | Effect |
| --- | --- |
| `get_workspec_workspace_summary` | Reads project, requirement, estimate, and file summaries. |
| `set_c4_architecture` | Atomically replaces the complete C4 snapshot and regenerates the plan. |
| `update_infrastructure_requirements` | Atomically applies a batch of neutral sizing changes. |
| `compare_cloud_providers` | Reads Azure and AWS mappings and estimates. |
| `record_cloud_decision` | Accepts a provider and writes the provider artifacts and ADR. |
| `export_workspec_bundle` | Returns the complete ZIP as base64 with filename and media type for agent-side saving or handoff. |

The tools call the same actions used by the visible React interface. A successful mutation is
visible immediately; invalid architecture or requirement input fails before the canonical file
map is changed.

The visible completion action is a native download link rather than a JavaScript-only blob click,
which lets Codex Browser use its normal file-download capability. WebMCP export is capped at 2 MiB;
larger imported workspaces should use the visible link rather than moving a large binary through JSON.
