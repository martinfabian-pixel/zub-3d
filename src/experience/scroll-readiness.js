const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** A scroll boundary can move forward as each batch of scene assets is ready.
 * Only an explicit navigation request survives the boundary. Native scroll
 * overrun is discarded so finishing a download never advances the visitor.
 */
export function createScrollReadiness(initialLimit) {
  let limit = unit(initialLimit);
  let pendingTarget = null;

  return {
    get limit() { return limit; },
    get pendingTarget() { return pendingTarget; },

    sample(requested) {
      const progress = unit(requested);
      return { progress: Math.min(progress, limit), blocked: progress > limit };
    },

    plan(requested) {
      const target = unit(requested);
      pendingTarget = target > limit ? target : null;
      return Math.min(target, limit);
    },

    advance(nextLimit) {
      const next = unit(nextLimit);
      if (next <= limit) return null;
      limit = next;
      if (pendingTarget === null) return null;
      const target = Math.min(pendingTarget, limit);
      if (target === pendingTarget) pendingTarget = null;
      return target;
    },

    cancel() { pendingTarget = null; },
  };
}
