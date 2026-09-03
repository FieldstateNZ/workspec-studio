# WebMCP Challenge submission: WorkSpec Studio

## Submission fields

**Title**

WorkSpec Studio — Architecture Decisions with Your Agent

**One-line pitch**

Design an application together, derive its infrastructure needs, compare Azure and AWS, record the
decision, and take the complete `.workspec` workspace with you.

**Live app**

<https://studio.workspec.io/>

**Public repository**

<https://github.com/FieldstateNZ/workspec-studio>

**License**

Apache-2.0

## Project description

WorkSpec Studio is a shared human-agent architecture workbench. Start with a blank project or
import an existing `.workspec` ZIP. A person and their agent then work through one connected,
reviewable journey:

1. Design the application as an interactive C4 model.
2. Derive an editable, provider-neutral infrastructure shopping list from its deployable elements.
3. Map the same requirements to Azure and AWS and compare deterministic monthly estimates.
4. Prepare and review the cloud-platform decision.
5. Record the approved choice as an architecture decision record and export the complete workspace.

The result is not trapped in a SaaS database. It is a portable tree of schema-validated YAML that
can be reviewed in the browser, downloaded as a ZIP, committed to Git, opened by WorkSpec tools, or
consumed by a hosted WorkSpec Enterprise installation.

## Why this is a strong fit for WebMCP

Architecture work combines two very different strengths. Agents are good at turning intent into a
coherent first draft and tracing consequences across many artifacts. People are responsible for
understanding the system, correcting assumptions, weighing trade-offs, and approving the durable
decision. Before WebMCP, an agent either manipulated a complex infinite canvas with fragile pointer
automation or edited files somewhere outside the UI the person was reviewing.

WorkSpec's WebMCP tools connect both sides to the same live browser state. The agent can make a
structured architectural proposal in one operation while the person immediately sees a real C4
diagram they can drag and edit. The infrastructure list is derived from that same model, the cloud
comparison uses that same list, and the ADR is generated only from the visible draft the person has
approved. The collaboration stays legible because successful calls appear in a collapsible Agent
activity history alongside the human-operated interface.

## What people and agents can do together

- Turn a plain-language product idea into a complete C4 context, logical, deployment, and component
  model without manually creating every node and relationship.
- Visually inspect, drag, and edit the agent's proposal on an infinite canvas rather than accepting
  an opaque generated document.
- Convert deployable architecture elements into neutral compute, database, and messaging needs,
  then refine quantity, size, availability, and notes together.
- Compare like-for-like Azure and AWS mappings without letting provider choices leak back into the
  source architecture.
- Let the agent prepare a provider recommendation and rationale while reserving ADR creation for an
  explicit human approval.
- Export the exact browser workspace through either the visible ZIP download or a bounded WebMCP
  base64 handoff, avoiding browser-download limitations for agents.

## How WebMCP is implemented

The workbench registers eleven imperative tools with `document.modelContext.registerTool()`:

- inspect the current workspace;
- navigate the gated workflow;
- open or close Studio sidebars;
- set a complete C4 architecture;
- inspect and pin diagram layout;
- update infrastructure requirements;
- compare provider mappings;
- prepare an unsaved decision;
- record the reviewed decision; and
- export the complete workspace ZIP.

All inputs use closed JSON schemas. Handlers resolve current state through stable action refs rather
than closing over an old render, and registrations share an `AbortController` so React Strict Mode
cannot leave duplicate tools behind. Failed calls do not appear as successful activity. The
decision flow is deliberately split: `prepare_cloud_decision` fills the visible editable form;
`record_cloud_decision` rejects calls until that draft exists and is intended to be called only
after the person explicitly approves it.

The browser holds one canonical `MemoryWorkspace` containing the `.workspec` file map. Human UI
actions and WebMCP handlers use the same C4 schemas, layout engine, topology planner, provider
mappings, decision engine, and ZIP writer. Local storage protects in-progress work across refreshes,
and unknown files from imported workspaces are preserved.

## What was built during the challenge

WorkSpec's reusable architecture, topology, cost, decision, schema, and canvas packages existed
before the challenge. During the challenge we built and deployed:

- the unified `/studio/design`, `/studio/plan`, `/studio/compare`, and `/studio/decision` journey;
- blank-project creation and `.workspec` ZIP import/export;
- the canonical browser-local workspace shared by every step;
- C4-to-infrastructure derivation and editable neutral requirements;
- deterministic Azure/AWS mapping and comparison;
- guarded decision drafting, ADR generation, and provider artifact generation;
- eleven connected-workflow WebMCP tools and the Agent activity sidebar;
- WebMCP-accessible layout inspection and arrangement for the infinite canvas; and
- focused integration tests covering the complete agent-assisted journey.

The Cost Studio at `/cost/demo` is also WebMCP-enabled and demonstrates a separate inspect,
preview, approve, and apply workflow over an 80-resource cloud-cost attribution dataset.

## Suggested judge walkthrough

Open <https://studio.workspec.io/>, choose **Start new**, and give the agent this prompt:

> Help me design Orderlight, an online ordering system that takes payment through an external
> gateway and fulfils accepted orders asynchronously. Build the C4 architecture, derive and review
> the infrastructure plan, compare Azure and AWS, and prepare a recommendation. Stop for my review
> at every stage and do not record the decision until I explicitly approve it.

At Design, switch between Context and Container, then between Logical and Deployment. Select or drag
an element to show that the generated model remains human-editable. Open **Agent activity** to see
the structured action history. Continue through the neutral infrastructure plan and provider
comparison. On Decision, edit or approve the visible rationale before asking the agent to record it.
Finish by downloading the `.workspec` ZIP or asking the agent to export it.

## Demo video storyboard — target 2:30

### 0:00–0:18 — The problem and promise

- Show the landing page.
- Voiceover: “Architecture decisions usually fragment across diagrams, spreadsheets, cloud pricing
  tabs, and ADR documents. WorkSpec turns that into one portable workflow a person and agent can
  operate together.”
- Click **Start new** and show the blank system dialog.

### 0:18–0:50 — Design together

- Paste the Orderlight prompt into the ChatGPT browser conversation.
- Show the C4 context model appear through WebMCP.
- Open Agent activity briefly, then show Context, Logical, and Deployment views.
- Drag or select one element to prove the canvas remains directly editable.

### 0:50–1:20 — Derive the infrastructure

- Ask the agent to open the infrastructure plan.
- Show compute, PostgreSQL, and messaging requirements inferred from deployable C4 elements.
- Ask for high availability on the orders database; show the table update and activity entry.

### 1:20–1:48 — Compare providers

- Ask the agent to compare providers.
- Show the same five requirements mapped side by side to Azure and AWS with monthly totals.
- Explain that these are deterministic planning estimates, not live quotes.

### 1:48–2:16 — Human approval

- Ask the agent to prepare, but not record, its recommendation.
- Show the visible provider and editable rationale.
- Say “I approve this decision,” then show the generated ADR.

### 2:16–2:30 — Portable result

- Download or agent-export the ZIP.
- End on the generated file tree and the repository URL.
- Voiceover: “One design, one traceable decision, and files you own.”

## Final submission checklist

- [x] Public live URL with no authentication requirement.
- [x] Public GitHub repository.
- [x] Apache-2.0 `LICENSE` in the repository root.
- [x] Source, setup instructions, implementation notes, and suggested prompt in the repository.
- [x] WebMCP tested in ChatGPT's in-app browser.
- [ ] Final production deployment contains the latest commit.
- [ ] Final end-to-end live rehearsal from a blank project.
- [ ] Record narrated demo under three minutes.
- [ ] Upload the demo publicly to YouTube and add its URL here and to Devpost.
- [ ] Paste the submission copy into Devpost and submit before September 3, 2026 at 1:00 p.m. PT.
- [ ] After the deadline, do not modify the submission, repository, or live deployment until judging
  is complete.
