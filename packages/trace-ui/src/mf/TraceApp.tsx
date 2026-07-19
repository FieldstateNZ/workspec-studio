// Module-federation expose: `./TraceApp` — the full shell (meters bar + view
// switch). Same `TraceApp` as the lib build. A host mounts this inside the
// `./provider` expose's `TraceStudioProvider`. Styles ride along on load.
import '../index.css';
import { TraceApp } from '../app.js';

export default TraceApp;
