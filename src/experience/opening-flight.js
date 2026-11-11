import { MathUtils } from 'three';
import { DENTAL_CHAPTERS, STORY_TIMING } from './story-config.js';

const spinMs=1150, flightMs=2000, maxFrameMs=75;
const singleTooth=DENTAL_CHAPTERS.find(chapter=>chapter.id==='assembly').at;
const [atlasStart,atlasEnd]=STORY_TIMING.atlas;

/** Sample the existing story backwards to gather the teeth before chapter 01. */
export function createOpeningFlight() {
  let previous,elapsed=0;
  const shot={progress:singleTooth,yaw:0,growth:0,phase:'spin',done:false};
  return {
    sample(now){
      if(shot.done)return shot;
      // Shader compilation or a busy first frame can stall the renderer.
      // Preserve the visible turn and flight through that gap.
      if(previous!==undefined)elapsed+=MathUtils.clamp(now-previous,0,maxFrameMs);
      previous=now;
      if(elapsed<spinMs){
        shot.yaw=2*Math.PI*MathUtils.smootherstep(elapsed,0,spinMs);
        shot.growth=MathUtils.smootherstep(elapsed,100,spinMs);
      }else{
        // A complete revolution returns to the authored orientation.
        shot.yaw=0;
        shot.growth=1;
        const travel=MathUtils.smoothstep(elapsed-spinMs,0,flightMs);
        shot.done=travel===1;
        shot.phase=shot.done?'done':'flight';
        // The atlas pose is constant between its end and the opening anchor.
        shot.progress=shot.done?atlasStart:MathUtils.lerp(singleTooth,atlasEnd,travel);
      }
      return shot;
    },
    pause(){previous=undefined;},
  };
}
