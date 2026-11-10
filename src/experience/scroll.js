const clamp = (value) => Math.max(0, Math.min(1, value));

/** A section with a sticky viewport ends when their bottom edges coincide. */
export function getScrollProgress(section, viewportHeight) {
  const rect = section.getBoundingClientRect();
  const height = viewportHeight ?? section.ownerDocument.defaultView.innerHeight;
  const travel = rect.height - height;
  return travel > 0 ? clamp(-rect.top / travel) : (rect.top < 0 ? 1 : 0);
}

// The document may end at the last available chapter. Measure against the
// full authored distance so adding room never changes the current chapter.
export function getJourneyScrollMetrics(section, stage) {
  const win = section.ownerDocument.defaultView;
  const rect = section.getBoundingClientRect();
  const viewport = stage?.getBoundingClientRect().height || win.innerHeight;
  const screens = Number.parseFloat(win.getComputedStyle?.(section).getPropertyValue('--journey-screens'));
  const travel = Number.isFinite(screens) ? viewport * screens : rect.height - viewport;
  return { top: rect.top, base: win.scrollY + rect.top, travel };
}

/**
 * Observes native document scrolling; it never consumes wheel, key or touch
 * input. No inertia/tween is added on top of the browser's own scrolling.
 * The first notification is synchronous so a restored page has the correct pose.
 */
export function createScrollDriver({ section, onProgress, stage, reduceMotionQuery = '(prefers-reduced-motion: reduce)' }) {
  const doc = section.ownerDocument, win = doc.defaultView;
  const motion = win.matchMedia(reduceMotionQuery);
  let frame = 0, lastProgress, lastMotion, disposed = false,lastTravel;

  const read = ({ top, travel }) => travel > 0 ? clamp(-top / travel) : Number(top < 0);
  const getProgress = () => read(getJourneyScrollMetrics(section, stage));
  function notify(force) {
    if (disposed) return lastProgress;
    const metrics = getJourneyScrollMetrics(section, stage);
    const p = read(metrics);
    lastTravel=metrics.travel;
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
  function resized(){
    if(disposed)return;
    const {base,travel}=getJourneyScrollMetrics(section, stage);
    if(lastTravel!==undefined&&Math.abs(travel-lastTravel)>.5&&lastProgress!==undefined)win.scrollTo({top:base+lastProgress*Math.max(0,travel),behavior:'instant'});
    lastTravel=travel;schedule();
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
  const observer = new win.ResizeObserver(resized);
  observer.observe(section);
  if (stage && stage !== section) observer.observe(stage);
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', resized);
  win.addEventListener('pageshow', schedule);
  win.visualViewport?.addEventListener('resize', resized);
  motion.addEventListener('change', schedule);
  doc.addEventListener('visibilitychange', onVisibility);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', resized);
    win.removeEventListener('pageshow', schedule);
    win.visualViewport?.removeEventListener('resize', resized);
    motion.removeEventListener('change', schedule);
    doc.removeEventListener('visibilitychange', onVisibility);
  }
  refresh();
  return { getProgress, refresh, dispose };
}
