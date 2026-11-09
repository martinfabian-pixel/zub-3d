import { DENTAL_CHAPTERS, DENTAL_STORY as story } from './story-config.js';

const unit = p => typeof p === 'number' && !Number.isNaN(p) ? Math.max(0, Math.min(1, p)) : 0;
const smooth = (a, b, p) => { const t = unit((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const ramp = (range, p) => smooth(range[0], range[1], p);

function indexAt(p) {
  for (let i = DENTAL_CHAPTERS.length - 1; i > 0; --i) if (p >= DENTAL_CHAPTERS[i].start) return i;
  return 0;
}

/** Half-open chapter intervals; the final one includes progress 1. */
export function getDentalChapter(progress) {
  return DENTAL_CHAPTERS[indexAt(unit(progress))];
}

function sampleBrush(p, pose) {
  const {keys, appear, align, work, withdraw, fade} = story.brush;
  // Evaluate the absolute path, never advance an animation or keep a previous
  // maximum. Completed keyframes give the furthest tip reach even after seeks.
  let insertion = 0, stroke = 0, maxReach = 0;
  for (let i = 1; i < keys.length; ++i) {
    const a = keys[i - 1], b = keys[i];
    if (p < a[0]) break;
    if (p >= b[0]) {
      insertion = b[1]; stroke = b[2]; maxReach = Math.max(maxReach, insertion);
    } else {
      const t = smooth(a[0], b[0], p);
      insertion = a[1] + (b[1] - a[1]) * t;
      stroke = a[2] + (b[2] - a[2]) * t;
      maxReach = Math.max(maxReach, insertion);
      break;
    }
  }
  pose.visibility = ramp(appear, p) * (1 - ramp(fade, p));
  pose.alignment = ramp(align, p) * (1 - smooth(withdraw[1], fade[1], p));
  pose.insertion = insertion; // Complete axial travel, including backoffs and withdrawal.
  pose.stroke = stroke;       // Articulation signal, not additional axial displacement.
  pose.withdrawal = ramp(withdraw, p);
  pose.phase = p < appear[0] || p >= fade[1] ? 'hidden' : p < align[1] ? 'align'
    : p < work[0] ? 'insert' : p <= work[1] ? 'stroke' : 'withdraw';
  // The first 10% of travel brings the tip to the beginning of the depicted
  // plaque patch. Working front can never exceed the furthest physical reach.
  return unit((maxReach - keys[1][1]) / (1 - keys[1][1]));
}

function evaluate(progress, reduced, out) {
  const raw = unit(progress), index = indexAt(raw), ch = DENTAL_CHAPTERS[index];
  const p = reduced ? ch.reducedAt : raw;
  out.progress = raw;
  out.sceneProgress = p;
  out.chapterIndex = index;
  out.chapterId = ch.id;
  out.chapter = ch;
  out.chapterProgress = unit((raw - ch.start) / (ch.end - ch.start));
  out.neighborsReveal = ramp(story.neighbors, p);
  out.gapFocus = ramp(story.gapFocus, p) * (1 - ramp(story.gapRelease, p));
  out.lowerReveal = ramp(story.lower, p);
  out.upperReveal = ramp(story.upper, p);
  out.plaqueDeposition = ramp(story.deposition, p);
  out.lesionProgress = ramp(story.lesion, p); // Independent of any cleaning or material effect.
  // The cavity is an earlier example. During a brief scene fade we switch to
  // a separate healthy-tooth example; brushing never reverses the lesion.
  out.lesionDisplay = p < .487 ? out.lesionProgress : 0;
  out.exampleOpacity = (1 - smooth(.478, .484, p)) + smooth(.490, .503, p);
  const pose = out.brushPose ?? (out.brushPose = {});
  out.cleaningProgress = sampleBrush(p, pose);
  // Remaining fraction in the reachable subset only; NOT the full biofilm's
  // opacity. The renderer applies plaqueDeposition and a spatial bristle-reach
  // mask; sites outside that mask keep their deposited plaque even at p = 1.
  out.plaqueCoverage = out.plaqueDeposition * (1 - out.cleaningProgress);
  out.brushVisibility = pose.visibility; out.brushAlignment = pose.alignment;
  out.brushInsertion = pose.insertion; out.brushStroke = pose.stroke; out.brushPhase = pose.phase;
  return out;
}

/** Pure absolute sampling. With an optional reusable output, no frame allocations. */
export function sampleDentalStory(progress, out = {}) { return evaluate(progress, false, out); }

/** Seven still scenes; raw scroll still selects the chapter without playing intermediate poses. */
export function sampleReducedDentalStory(progress, out = {}) { return evaluate(progress, true, out); }
