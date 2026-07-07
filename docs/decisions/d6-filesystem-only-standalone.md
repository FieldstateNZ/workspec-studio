# D6 — Filesystem-only standalone (no database, ever)

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-07-01
- **Format note:** authored as a **markdown ADR**. This decision's whole point is to _eliminate_
  a cost/ops category — the chosen option's run cost is ~$0, which the costed decision format
  marks "incomplete" (an option needs `monthly > 0` to be complete). A decision whose winner is
  "zero" is better argued in prose than forced through the cost engine. (This limitation was
  itself surfaced by dogfooding — see [`workspec-tech-spec-v0.1.md`](../workspec-tech-spec-v0.1.md).)

## Context

Decision Studio is a git-native tool that people run in their own repo. Its artifacts are the
`*.decision.yaml` / `*.catalog.yaml` files already in the working tree. The storage question is:
what backs the standalone app's reads and writes?

## Options considered

- **The working tree, via a repository port** (chosen). A six-method `DecisionRepositoryPort`
  (`list`/`read`/`write` × decision/catalog). `FsRepository` discovers artifacts by filename
  suffix, validates on read and write, preserves YAML comments, and stamps the `$schema` header.
  No index, no daemon, no database. Git is the history, review, and concurrency story.
- **An embedded database** (SQLite bundled with the app). Adds query power and an index, but now
  there are two sources of truth (the DB and the files), a sync problem, and a binary artifact
  that is not the thing users diff and review.
- **Require an external database** (Postgres). Real infra + ops cost imposed on every user just
  to look at some YAML — antithetical to "run one command in your repo."

## Decision

Standalone has no database, ever. The files in the working tree are the single source of truth;
the app never owns state the files do not. The same `DecisionRepositoryPort` seam lets the
identical UI run over `FsRepository` (standalone) and, in WorkSpec Enterprise, over a
graph-backed implementation — the abstraction is where standalone ends and enterprise begins.

## Consequences

- **+** Zero setup: `npx @workspec/decision-studio` in a repo just works.
- **+** Decisions version, branch, review, and merge as ordinary files — git _is_ the database.
- **+** The port keeps the UI storage-agnostic, which is what makes the open-core mount possible.
- **−** No cross-repo querying or server-side aggregation standalone; that is deliberately an
  Enterprise capability, reached through the same port.
- **−** Large trees are re-scanned per listing (no index). Fine at the scale a repo of decisions
  reaches; an index would be the first thing to add if that ever bites.
