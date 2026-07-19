// Module-federation expose: `./MetersBar` — the same component as the lib
// build. Importing the stylesheet here means loading this federated module
// injects the compiled component styles automatically, so a host needs no
// separate CSS wiring.
import '../index.css';
import { MetersBar } from '../meters-bar.js';

export default MetersBar;
