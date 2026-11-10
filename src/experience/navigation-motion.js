// Button navigation advances native scroll, not the camera independently.
// Sampling is absolute in time so long frames cannot create a second timeline.
export function createNavigationMotion(from, to, startTime) {
  const distance = Math.abs(to - from);
  const duration = Math.min(2600, 1150 + distance * 1500);
  return {
    sample(now) {
      const t = Math.max(0, Math.min(1, (now - startTime) / duration));
      const eased = t * t * (3 - 2 * t);
      return { progress: from + (to - from) * eased, done: t === 1 };
    },
  };
}
