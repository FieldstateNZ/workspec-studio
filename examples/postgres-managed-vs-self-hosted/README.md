# Example — Postgres: managed vs self-hosted

A second worked example for WorkSpec Decision Studio, proving the tool is not single-purpose:
**where should production Postgres run?** — comparing a managed PaaS (Azure Database for
PostgreSQL Flexible Server), the same managed service with **zone-redundant HA + a read
replica**, and **self-hosting on Kubernetes** (the CloudNativePG operator on the existing AKS
cluster), costed across dev / test / prod.

## Artifacts

| File                                                                 | Artifact                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`postgres.catalog.yaml`](./postgres.catalog.yaml)                   | Catalog — pricing modes, schedules, SKUs                            |
| [`postgres-hosting.decision.yaml`](./postgres-hosting.decision.yaml) | Decision — three costed options, criteria, levers, recorded outcome |

Both carry the `$schema` directive header, validate against `@workspec/decision-schema`, and
compute through `@workspec/decision-engine`. Unlike the hosting-platform fixture (which stays `exploring`),
this decision is **`decided`** — it carries a recorded `spec.outcome`, so it demonstrates the
"Accepted" ADR state end-to-end.

## Costs at the default lever state

Default levers: `scheduleNonProd` **on** (dev + test run business hours), `reserveProd` /
`reserveNodes` **off**. All amounts NZD.

| Option                      |     dev |    test |   prod |      annual | note           |
| --------------------------- | ------: | ------: | -----: | ----------: | -------------- |
| Managed (single-zone)       |    $232 |    $232 |   $740 | **$14,448** | cheapest       |
| Managed (HA + read replica) |    $232 |    $282 | $3,040 | **$42,648** | chosen outcome |
| Self-hosted on Kubernetes   | $101.50 | $101.50 | $1,890 | **$25,116** | most control   |

The interesting result: **cheapest ≠ chosen.** Single-zone managed is cheapest, but the decision
records managed **HA** as the outcome — resilience is weighted heavily and a zone outage is
unacceptable for a shared platform DB. Self-hosting has the cheapest compute and the best control
/ portability scores, but its **loaded on-call line** (`$500/mo` prod, an estimate) and heavy ops
burden pull it out of contention for a team this size.

## Try it

```bash
# validate + render the ADR from the working tree
npx @workspec/decision-studio validate --dir examples/postgres-managed-vs-self-hosted
npx @workspec/decision-studio render-adr --dir examples/postgres-managed-vs-self-hosted

# or open it in the studio and toggle the reserve levers to watch prod drop
npx @workspec/decision-studio --dir examples/postgres-managed-vs-self-hosted
```

Toggling **Reserve prod** (managed) or **Reserve prod nodes** (self-hosted) moves the always-on
prod compute to a 3-year reserved mode (`0.55×`), which the ADR surfaces as headroom: reserving
steady prod on the chosen option recovers about **$14,040/yr**.
