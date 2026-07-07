// Host globals. `__DS_HOST_REACT` carries the host's React instance so the
// remote's `reactProbe` can confirm it shares that exact instance.
declare global {
  interface Window {
    __DS_HOST_REACT?: unknown;
  }
}

export {};
