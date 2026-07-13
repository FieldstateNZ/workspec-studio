# The `fieldstate-azure` demo estate fixture

`demo.inventory.yaml`, `demo.spend.yaml` and `demo.attribution.yaml` are the committed,
byte-stable serialization of the "fieldstate-azure" demo estate: 80 resources, 8 rules, 1
pinned override. The data is transcribed verbatim from the Claude Design handoff prototypes
(`Attribution Workbench.dc.html` / `WorkSpec Studio.dc.html`, Studio superset — the variant with
`fs-*` tags on 5 resources, needed so the tag-plan diff has `change`/`remove`/`noop` cases, not
just `add`).

These files are **generated, not hand-authored**: the single source of truth is
`../../src/demo-estate.fixture.ts` (`RAW_RESOURCES`, `RAW_RULES`, `RAW_DIMENSIONS`, the override).
`src/demo-estate.test.ts` rebuilds the three artifacts from that module at test time and asserts
`serialize*Yaml(rebuilt) === <committed file text>` byte-for-byte — a committed fixture that drifts
from `demo-estate.fixture.ts` fails CI. To regenerate after changing the fixture data:

```bash
pnpm --filter @workspec/cost-engine gen:fixtures
```

## Fields the prototypes don't carry (synthesized here)

The Claude Design prototypes carry `{ name, type, resourceGroup, tags, spendPerMonth }` per
resource and nothing else — no `location`, no per-resource `id`, no `subscription`, no ISO
currency code, no spend period. To satisfy the Inventory/Spend schema (`@workspec/cost-schema`),
this fixture synthesizes:

| Field                          | Synthesized value                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `subscription`                  | `00000000-0000-0000-0000-000000000001` for every resource                          |
| `location`                      | `australiaeast` for every resource                                                  |
| Inventory `spec.asOf`           | `2026-07-07T00:00:00Z` (the prototype's "inventory asOf 2026-07-07" copy)           |
| Spend row `period`              | `2026-07` ("July 2026 · monthly" in the prototype)                                 |
| Spend row `currency`            | `USD` (the prototype has no ISO code; amounts are `'$' + n.toLocaleString('en-US')`) |
| Spend row `serviceCategory`     | the prototype's per-resource `type` string, verbatim                               |
| Metadata ids                    | kebab-case: `fieldstate-azure` (Inventory/Attribution), `fieldstate-azure-2026-07` (Spend) |

### Resource `id` synthesis

Each resource's `id` is a lowercase ARM-style path:

```
/subscriptions/00000000-0000-0000-0000-000000000001/resourcegroups/{resourceGroup}/providers/{providerPath}/{name}
```

`{providerPath}` comes from a fixed `type → providerPath` table (`TYPE_PROVIDER_PATH` in
`demo-estate.fixture.ts`) defined once for this fixture — it is a stable, deterministic mapping,
not a claim that every path is the Azure-real one (e.g. `Functions` is split from `App Service`
into its own path for readability, even though both are `Microsoft.Web/sites` in real Azure).
`Inventory.spec.resources[]` is sorted ascending by this synthesized `id` (the schema's
sort-order contract), so resource order in the committed YAML does **not** match the prototype's
original (roughly resource-group-grouped) order.

The pinned override's `resourceId` (`vm-old-jenkins`) is this same synthesized id — overrides
match by resource id, not by name.

## What's normative vs. synthesized

Everything else — resource names, types, resource groups, tags, `spendPerMonth`, the 8 rules'
match/effect fields, the override's target and assignment, the three dimensions and their
declared values — is verbatim from the prototypes and is the golden-test oracle
(`src/golden.test.ts`) against exact dollar and count figures independently re-derived from the
same source data.
