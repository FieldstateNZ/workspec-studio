// Module-federation expose: `./DecisionWorkspace` → the full four-view app.
// The SAME `DecisionApp` the standalone lib build ships — no fork. Importing the
// stylesheet here means loading this federated module injects the `--ds-*`
// component styles automatically, so a host needs no separate CSS wiring.
import '../styles.css';
import { DecisionApp } from '../app.js';

export default DecisionApp;
