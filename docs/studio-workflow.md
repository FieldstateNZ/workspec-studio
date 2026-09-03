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

In a browser that supports the imperative WebMCP API, Studio exposes eleven page-scoped tools:

| Tool | Effect |
| --- | --- |
| `get_workspec_workspace_summary` | Reads project, requirement, estimate, and file summaries. |
| `navigate_studio` | Opens visible workflow steps without pointer automation, while enforcing prerequisites and review order. |
| `set_studio_sidebar` | Opens or closes the workflow or architecture sidebar and selects the Elements or Properties tab. |
| `set_c4_architecture` | Atomically replaces the complete C4 snapshot and regenerates the plan. |
| `get_c4_layout` | Reads the nodes and pinned positions for a C4 diagram. |
| `set_c4_layout` | Curates or adjusts persisted C4 node positions without changing architecture semantics. |
| `update_infrastructure_requirements` | Atomically applies a batch of neutral sizing changes. |
| `compare_cloud_providers` | Opens the visible Compare step and reads Azure and AWS mappings and estimates. |
| `prepare_cloud_decision` | Opens Decision with an editable, explicitly unsaved provider and rationale draft for joint review. |
| `record_cloud_decision` | Commits the currently visible prepared draft after the user approves it. |
| `export_workspec_bundle` | Returns the complete ZIP as base64 with filename and media type for agent-side saving or handoff. |

The tools call the same actions used by the visible React interface. A successful mutation or UI
control is visible immediately; invalid architecture, navigation, sidebar, or requirement input
fails before the requested state is changed. Provider selection is intentionally staged:
`compare_cloud_providers` makes the comparison visible, `prepare_cloud_decision` renders an unsaved
draft, and `record_cloud_decision` is reserved for the user's explicit approval of that draft.

The visible completion action is a native download link rather than a JavaScript-only blob click,
which lets Codex Browser use its normal file-download capability. WebMCP export is capped at 2 MiB;
larger imported workspaces should use the visible link rather than moving a large binary through JSON.
