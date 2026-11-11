import { MathUtils } from 'three';
import { DENTAL_CHAPTERS, STORY_TIMING } from './story-config.js';

export const anatomyLayers = Object.freeze(['whole', 'enamel', 'dentin', 'pulp']);
const chapter = DENTAL_CHAPTERS.find(({ id }) => id === 'anatomy');
const ramp = (progress, [start, end]) => MathUtils.smoothstep(progress, start, end);
const MANUAL_DURATION = 460;
const ENTRY_BLEND = .008;

/** Scroll owns the default cross-section. A deliberate layer choice can take
 * over for this chapter and blends back to the moving playhead when released. */
export function createStoryAnatomy() {
  const state = { active: false, layer: 'whole', amount: 0, cut: 0, moving: false, manual: false };
  let selected = null, change = null, displayed = 0;

  function changeLayer(target, now) {
    change = { from: displayed, began: now };
    selected = target;
  }

  return {
    select(layer, now = performance.now()) {
      const index = anatomyLayers.indexOf(layer);
      if (state.active && index >= 0 && selected !== index) changeLayer(index, now);
    },
    follow(now = performance.now()) {
      if (selected !== null) changeLayer(null, now);
    },
    update({ progress, now, reducedMotion }) {
      const { enamel, dentin, pulp, close } = STORY_TIMING.anatomy;
      const active = progress >= chapter.start && progress < chapter.end;
      const closure = 1 - ramp(progress, close);
      if (!active || progress >= close[1]) { selected = null; change = null; }
      const automatic = ramp(progress, enamel) + ramp(progress, dentin) + ramp(progress, pulp);
      const target = selected ?? automatic;
      const t = change && !reducedMotion ? MathUtils.clamp((now - change.began) / MANUAL_DURATION, 0, 1) : 1;
      displayed = t < 1 ? MathUtils.lerp(change.from, target, MathUtils.smootherstep(t, 0, 1)) : target;
      if (t === 1) change = null;
      // Let a layer choice work near the chapter entrance, while still
      // closing the cut on reverse scroll into the preceding intact tooth.
      const entry = MathUtils.smoothstep(progress, chapter.start, chapter.start + ENTRY_BLEND);
      const amount = displayed * entry * closure;
      state.active = active;
      state.amount = amount;
      state.cut = Math.min(1, displayed) * entry * closure;
      state.layer = anatomyLayers[active && selected !== null ? selected : Math.round(amount)];
      state.moving = t < 1;
      state.manual = active && selected !== null;
      return state;
    },
  };
}
