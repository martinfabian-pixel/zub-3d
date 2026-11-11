import { MathUtils } from 'three';
import { DENTAL_CHAPTERS, STORY_TIMING } from './story-config.js';

export const anatomyLayers = Object.freeze(['whole', 'enamel', 'dentin', 'pulp']);
export const anatomyMax = anatomyLayers.length - 1;
const chapter = DENTAL_CHAPTERS.find(({ id }) => id === 'anatomy');
const ramp = (progress, [start, end]) => MathUtils.smoothstep(progress, start, end);
const MANUAL_DURATION = 460;
const ENTRY_BLEND = .008;

export const storyPulpReveal = amount => MathUtils.smoothstep(amount, 2.1, 2.94);
export const storyPulpPickable = amount => .97 * storyPulpReveal(amount) >= .08;

function canRetainInspection(layer, amount, cut) {
  if (layer === 'pulp') return cut > 0 && storyPulpPickable(amount);
  if (layer === 'dentin') return cut > .06 && amount > .06;
  return layer === 'enamel';
}

/** Scroll owns the default cross-section. A deliberate layer choice can take
 * over for this chapter and blends back to the moving playhead when released. */
export function createStoryAnatomy() {
  const state = { active: false, layer: 'whole', preset: 'whole', highlight: null, amount: 0, cut: 0, moving: false, manual: false };
  let manual = null, change = null, inspection = null, playhead = chapter.start;

  function takeControl(amount, now = null) {
    inspection = null;
    manual = { amount, anchor: playhead };
    change = now === null ? null : { amount: state.amount, cut: state.cut, began: now };
  }

  return {
    select(layer, now = performance.now()) {
      const index = anatomyLayers.indexOf(layer);
      if (!state.active || index < 0) return;
      inspection = null;
      if (manual?.amount !== index || (!change && state.amount !== index)) takeControl(index, now);
    },
    scrub(amount) {
      if (!state.active || !Number.isFinite(amount)) return;
      takeControl(MathUtils.clamp(amount, 0, anatomyMax));
    },
    inspect(layer) {
      if (layer === null || (state.active && anatomyLayers.indexOf(layer) > 0)) inspection = layer;
    },
    follow(now = performance.now()) {
      inspection = null;
      if (!manual) return;
      manual = null;
      change = { amount: state.amount, cut: state.cut, began: now };
    },
    update({ progress, now, reducedMotion }) {
      const { enamel, dentin, pulp, close } = STORY_TIMING.anatomy;
      const active = progress >= chapter.start && progress < chapter.end;
      playhead = progress;
      if (!active) { manual = null; change = null; inspection = null; }
      const automatic = ramp(progress, enamel) + ramp(progress, dentin) + ramp(progress, pulp);
      const level = manual?.amount ?? automatic;
      // A visitor can use the entire range at the current playhead, even
      // during the opening or closing beat. A later scroll to either edge
      // still closes the cut before the next teaching view.
      const entryEnd = Math.min(chapter.start + ENTRY_BLEND, manual?.anchor ?? Infinity);
      const entry = manual && progress >= manual.anchor ? 1 : MathUtils.smoothstep(progress, chapter.start, entryEnd);
      const closeStart = Math.max(close[0], manual?.anchor ?? -Infinity);
      const closure = 1 - MathUtils.smoothstep(progress, closeStart, close[1]);
      const envelope = active ? entry * closure : 0;
      const amount = level * envelope;
      const cut = Math.min(1, level) * envelope;
      const t = change && !reducedMotion ? MathUtils.clamp((now - change.began) / MANUAL_DURATION, 0, 1) : 1;
      const eased = MathUtils.smootherstep(t, 0, 1);
      const renderedAmount = change ? MathUtils.lerp(change.amount, amount, eased) : amount;
      const renderedCut = change ? MathUtils.lerp(change.cut, cut, eased) : cut;
      if (inspection && !canRetainInspection(inspection, renderedAmount, renderedCut)) inspection = null;
      state.active = active;
      state.amount = renderedAmount;
      state.cut = renderedCut;
      state.preset = anatomyLayers[Math.round(renderedAmount)];
      state.highlight = inspection;
      state.layer = inspection ?? state.preset;
      state.moving = t < 1;
      state.manual = Boolean(manual);
      if (t === 1) change = null;
      return state;
    },
  };
}
