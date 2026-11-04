const clamp = (value) => Math.max(0, Math.min(1, value));

/** A section with a sticky viewport ends when their bottom edges coincide. */
export function getScrollProgress(section, viewportHeight) {
  const rect = section.getBoundingClientRect();
  const height = viewportHeight ?? section.ownerDocument.defaultView.innerHeight;
  const travel = rect.height - height;
  return travel > 0 ? clamp(-rect.top / travel) : (rect.top < 0 ? 1 : 0);
}

/**
 * Observes native document scrolling; it never consumes wheel, key or touch
 * input. No inertia/tween is added on top of the browser's own scrolling.
 * The first notification is synchronous so a restored page has the correct pose.
 */
export function createScrollDriver({ section, onProgress, stage, reduceMotionQuery = '(prefers-reduced-motion: reduce)' }) {
  const doc = section.ownerDocument, win = doc.defaultView;
  const motion = win.matchMedia(reduceMotionQuery);
  let frame = 0, lastProgress, lastMotion, disposed = false;

  function getProgress() {
    const viewport = stage?.getBoundingClientRect().height || win.innerHeight;
    return getScrollProgress(section, viewport);
  }
  function notify(force) {
    if (disposed) return lastProgress;
    const p = getProgress();
    if (force || lastProgress !== p || lastMotion !== motion.matches) {
      lastProgress = p;
      lastMotion = motion.matches;
      onProgress(p, { reducedMotion: lastMotion });
    }
    return p;
  }
  function schedule() {
    if (disposed || doc.hidden || frame) return;
    frame = win.requestAnimationFrame(() => { frame = 0; notify(false); });
  }
  function refresh() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    return notify(true);
  }
  function onVisibility() {
    if (doc.hidden) { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  }
  const observer = new win.ResizeObserver(schedule);
  observer.observe(section);
  if (stage && stage !== section) observer.observe(stage);
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);
  win.addEventListener('pageshow', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  motion.addEventListener('change', schedule);
  doc.addEventListener('visibilitychange', onVisibility);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('pageshow', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    motion.removeEventListener('change', schedule);
    doc.removeEventListener('visibilitychange', onVisibility);
  }
  refresh();
  return { getProgress, refresh, dispose };
}
