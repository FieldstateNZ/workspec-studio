/**
 * Runs async tasks strictly one-at-a-time, in arrival order. Every mutation
 * service is a read→edit→write span over shared files; two concurrent
 * mutations touching the same file would each read the same "before" text
 * and the second write would silently drop the first edit (classic lost
 * update — reproduced live in the A2 adversarial review). A per-served-tree
 * FIFO is sufficient serialization at this host's scale (single user,
 * localhost): enterprise serializes its artifact writes for exactly this
 * reason.
 */
export type MutationQueue = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Builds a {@link MutationQueue}: a promise-chain mutex. Each task starts
 * only after every previously-enqueued task settled; a task's failure
 * rejects its own caller but never blocks the chain (the tail swallows the
 * rejection after re-throwing it to the caller).
 */
export function createMutationQueue(): MutationQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(() => task());
    // The next task must run whether this one resolved or rejected; the
    // caller still observes the rejection through `run` itself.
    tail = run.catch(() => undefined);
    return run;
  };
}
