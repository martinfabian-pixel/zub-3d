/** Select a fixed asset/shadow profile once; adaptation never replaces geometry. */
export function chooseQuality(config) {
  const compact = window.matchMedia(config.quality.compactMedia).matches;
  const settings = compact ? config.quality.compact : config.quality.desktop;
  return Object.freeze({
    ...settings,
    name: compact ? 'compact' : 'desktop',
    compact,
    pixelRatio: Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap),
  });
}

/**
 * recordFrame receives a measured rAF interval during active rendering, not
 * CPU render duration (WebGL commands are asynchronous). No FPS is inferred.
 * Full resolution returns after interaction, including its damping, has ended.
 */
export function createAdaptiveQuality({ renderer, profile, requestRender, config }) {
  const settings = config.quality.adaptive;
  let active = false;
  let disposed = false;
  let restoreTimer;
  let sampleCount = 0;
  let slowCount = 0;
  let warmup = settings.warmupFrames;
  let pixelRatio = profile.pixelRatio;
  let transmissionScale = profile.transmissionScale;
  let learnedInteractionRatio = Math.min(profile.pixelRatio, settings.interactionPixelRatioCap);

  function apply(nextPixelRatio, nextTransmissionScale) {
    if (disposed) return;
    const changed = pixelRatio !== nextPixelRatio || transmissionScale !== nextTransmissionScale;
    pixelRatio = nextPixelRatio;
    transmissionScale = nextTransmissionScale;
    // setPixelRatio preserves the renderer's logical size and resizes its buffers.
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    renderer.transmissionResolutionScale = transmissionScale;
    if (changed) requestRender();
  }

  function beginInteraction() {
    if (disposed || !settings.enabled) return;
    clearTimeout(restoreTimer);
    if (active) return;
    active = true;
    sampleCount = 0;
    slowCount = 0;
    warmup = settings.warmupFrames;
    apply(learnedInteractionRatio, Math.min(profile.transmissionScale, settings.interactionTransmissionScale));
  }

  function endInteraction() {
    if (disposed || !settings.enabled || !active) return;
    active = false;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      if (!active && !disposed) apply(profile.pixelRatio, profile.transmissionScale);
    }, settings.restoreDelayMs);
  }

  function recordFrame(milliseconds) {
    if (disposed || !settings.enabled || !active || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    if (warmup > 0) {
      warmup -= 1;
      return;
    }
    sampleCount += 1;
    if (milliseconds > (profile.frameBudgetMs ?? settings.frameBudgetMs)) slowCount += 1;
    if (sampleCount < settings.sampleCount) return;
    if (slowCount / sampleCount >= settings.slowFraction) {
      learnedInteractionRatio = Math.max(Math.min(profile.pixelRatio, settings.minimumPixelRatio),
        pixelRatio * settings.reductionFactor);
      apply(learnedInteractionRatio, transmissionScale);
      // Ignore intervals immediately following framebuffer reallocation.
      warmup = settings.warmupFrames;
    }
    sampleCount = 0;
    slowCount = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(restoreTimer);
  }

  apply(profile.pixelRatio, profile.transmissionScale);
  return { beginInteraction, endInteraction, recordFrame, dispose };
}
