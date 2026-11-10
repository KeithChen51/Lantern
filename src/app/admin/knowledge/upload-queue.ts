export type QueueIdentity = { id: string; path: string };

/** A new selection replaces only the selected path; each selection has its own ID. */
export function mergeUploadSelection<T extends QueueIdentity>(queue: T[], selection: T[]) {
  const selectedPaths = new Set(selection.map(item => item.path));
  return [...queue.filter(item => !selectedPaths.has(item.path)), ...selection];
}

/** Settle exactly the submitted selections without discarding additions or replacements. */
export function settleUploadBatch<T extends QueueIdentity>(queue: T[], submitted: T[], failed: T[]) {
  const submittedIds = new Set(submitted.map(item => item.id));
  const remaining = queue.filter(item => !submittedIds.has(item.id));
  const remainingIds = new Set(remaining.map(item => item.id));
  return [...remaining, ...failed.filter(item => !remainingIds.has(item.id))];
}
