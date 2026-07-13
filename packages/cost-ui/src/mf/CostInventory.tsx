// Module-federation expose: `./CostInventory` — the same component as the lib
// build. Importing the stylesheet here means loading this federated module
// injects the compiled component styles (WorkSpec tokens + the utilities the
// adopted design-system components need) automatically, so a host needs no
// separate CSS wiring.
import '../index.css';
import { CostInventory } from '../cost-inventory.js';

export default CostInventory;
