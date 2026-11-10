import { FINAL_SMILE_COPY, STORY_TIMING } from './story-config.js';

// Screen-space art direction, sampled by the same progress as the WebGL scene.
// These are positions within the entire stage, never a separate text column.
export const TYPE_COMPOSITIONS = Object.freeze({
  hero:      {desktop:[.067,.24,.36,70],mobile:[.06,.092,.66,32]},
  assembly:  {desktop:[.067,.22,.27,57],mobile:[.06,.11,.72,32]},
  anatomy:   {desktop:[.067,.16,.30,62],mobile:[.06,.13,.62,32]},
  space:     {desktop:[.067,.22,.28,64],mobile:[.06,.165,.60,34]},
  plaque:    {desktop:[.067,.22,.29,64],mobile:[.06,.125,.64,33]},
  brush:     {desktop:[.067,.23,.30,64],mobile:[.06,.12,.61,33]},
  result:    {desktop:[.067,.15,.32,62],mobile:[.06,.13,.72,31]},
  dentition: {desktop:[.067,.25,.32,64],mobile:[.06,.125,.72,32]},
  closing:   {desktop:[.067,.25,.32,64],mobile:[.06,.125,.72,32]},
});

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
const resultCopy={title:'Čistý priestor. Zdravý zub.',titleLines:['Čistý priestor.','Zdravý zub.'],
  text:'Kefka odstránila časť povlaku.'};
const brushPhases={
  result:{...resultCopy,phase:'result',start:STORY_TIMING.result[0],end:STORY_TIMING.finalCopy[0]},
  closing:{...FINAL_SMILE_COPY,phase:'closing',start:STORY_TIMING.finalCopy[0],end:1},
};

export function getStoryCopy(chapter,progress) {
  if(chapter.id!=='brush')return chapter;
  if(progress>=brushPhases.closing.start)return brushPhases.closing;
  if(progress>=brushPhases.result.start)return brushPhases.result;
  return chapter;
}

export function sampleStageTypography(chapter,progress,{mobile=false,reducedMotion=false,free=false,sceneProgress=progress}={}) {
  const copy=getStoryCopy(chapter,sceneProgress);
  const [x,y,width,font]=TYPE_COMPOSITIONS[copy.phase??chapter.id][mobile?'mobile':'desktop'];
  // One DOM paragraph is replaced while fully faded at the chapter boundary.
  // Direct jumps and backward scroll reconstruct exactly the same layout.
  const incoming=copy.start===0?1:smooth((progress-copy.start)/.008);
  const outgoing=copy.end===1?1:smooth((copy.end-progress)/.004);
  let opacity=reducedMotion?1:Math.min(incoming,outgoing);
  if(!reducedMotion){
    if(chapter.id==='assembly'){
      const opening=smooth((progress-STORY_TIMING.flight[0])/.035);
      const landing=smooth((progress-.247)/.04);
      opacity*=1-.48*opening*(1-landing);
    }
    if(chapter.id==='brush'&&copy===chapter)opacity*=smooth((STORY_TIMING.result[0]-progress)/.009);
    if(copy.phase==='result')opacity*=1-.75*smooth((progress-STORY_TIMING.result[1])/.018);
  }
  return {x,y,width,font,opacity:opacity*(free ? .58 : 1),shift:reducedMotion?0:(1-opacity)*8};
}

export function createStageTypography(stage,copy) {
  let current;
  return {
    update(chapter,progress,options) {
      const next = sampleStageTypography(chapter,progress,options);
      if (!current || current.x !== next.x || current.y !== next.y ||
          current.width !== next.width || current.font !== next.font) {
        copy.style.left = `${next.x * 100}%`;
        copy.style.top = `${next.y * 100}%`;
        copy.style.width = `${next.width * 100}%`;
        copy.style.setProperty('--title-size', `${next.font}px`);
      }
      if (current?.opacity !== next.opacity) copy.style.opacity = next.opacity;
      if (current?.shift !== next.shift) copy.style.transform = `translateY(${next.shift}px)`;
      if (stage.dataset.chapter !== chapter.id) stage.dataset.chapter = chapter.id;
      current = next;
    },
    report:()=>current?{...current}:null,
  };
}
