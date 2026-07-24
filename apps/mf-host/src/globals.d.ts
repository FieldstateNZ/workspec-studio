// Host globals. `__DS_HOST_REACT` carries the host's React instance so the
// decision-ui/c4-ui/cost-ui remotes' `reactProbe`s can confirm they share
// that exact instance. `__TP_HOST_REACT` is the SAME stamp under
// topology-ui's own global name — its `reactProbe` (packages/topology-ui/src/mf/reactProbe.ts)
// reads `window.__TP_HOST_REACT` rather than `__DS_HOST_REACT`, so the host
// stamps both names onto the one React instance rather than the remote's
// probe silently reading `undefined`.
declare global {
  interface Window {
    __DS_HOST_REACT?: unknown;
    __TP_HOST_REACT?: unknown;
  }
}

export {};
