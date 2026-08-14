# @workspec/decision-ui

Host-agnostic React views for repository-native WorkSpec Decision records.

The core app has two views:

- **Record** edits the canonical Decision fields and persists them through the repository port.
- **View mode** renders the record as a readable architecture decision record.

```tsx
const host: DecisionStudioHost = {
  repository,
  capabilities: { editDecision: true },
};

<DecisionStudioProvider host={host}>
  <DecisionApp decisionRef=".workspec/decisions/database.yaml" />
</DecisionStudioProvider>;
```

The UI depends on the three-operation `DecisionRepositoryPort`. It has no
catalog, pricing, recommendation, criteria, evidence, or cost-analysis
dependency. Hosts may grant read-only access with `editDecision: false`.

Exports include `DecisionApp`, `DecisionWorkspace`, `DecisionAdr`,
`DecisionCard`, the provider and query hooks, theming helpers, and the existing
module-federation entry points. Import `@workspec/decision-ui/styles.css` once.
