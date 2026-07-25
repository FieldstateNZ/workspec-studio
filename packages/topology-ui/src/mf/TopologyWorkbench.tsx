// Module-federation expose: `./TopologyWorkbench` → the full authored-only
// workbench. The SAME `TopologyWorkbench` the standalone lib build ships —
// no fork. Importing the stylesheet here means loading this federated
// module injects the compiled component styles (WorkSpec tokens + the
// canvas/panel/header CSS) automatically, so a host needs no separate CSS
// wiring.
import '../index.css';
import { TopologyWorkbench } from '../topology-workbench.js';

export default TopologyWorkbench;
