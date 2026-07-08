// Module-federation expose: `./AdrView` → a read-only architecture decision
// record. `DecisionAdr` with `capabilities.decide` forced off (one component, no
// fork). Styles ride along on load.
import '../index.css';
import { ReadOnlyAdr } from '../read-only-adr.js';

export default ReadOnlyAdr;
