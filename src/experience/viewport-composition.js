import { MathUtils } from 'three';

/** A real camera sensor, not an alpha mask. The scene area retains its layout
 * height; a crown photograph uses a wider field inside that same white space.
 * No model opacity, clipping plane, CSS mask or fog is involved.
 */
export function createViewportComposition({area,viewport,settings,compact=false}) {
  const parent=area.parentElement,originalMaximum=area.style.maxHeight,originalJustification=parent.style.justifyContent;
  const aspect=compact?settings.compactAspect:settings.aspect;
  parent.style.justifyContent='center';
  let from=0,to=0,started=-Infinity,weight=0,lastHeight=-1,disposed=false,lastMode=null;
  function current(now){return MathUtils.lerp(from,to,MathUtils.smoothstep((now-started)/settings.durationMs,0,1));}
  return {
    update({progress,finalView,free,now=performance.now(),reducedMotion=false}){
      if(disposed)return false;
      const next=finalView==='smile'&&!free?MathUtils.smoothstep(progress,...settings.arrival):0;
      // Story scrubbing is an absolute state. Only the explicit mode switch
      // uses a short layout transition so user-controlled viewing stays calm.
      const mode=finalView+':'+free;
      if(lastMode!==null&&mode!==lastMode){from=current(now);to=next;started=now;}
      else if(now-started>=settings.durationMs){from=to=next;started=-Infinity;}
      else to=next;
      lastMode=mode;
      if(reducedMotion){from=to;started=-Infinity;}
      weight=current(now);
      const width=area.clientWidth;
      let height=parent.clientHeight;
      for(const child of parent.children)if(child!==area){const style=getComputedStyle(child);height-=child.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);}
      const photograph=Math.min(height,width/aspect);
      const desired=Math.max(1,MathUtils.lerp(height,photograph,weight));
      if(Math.abs(desired-lastHeight)>.2){area.style.maxHeight=desired.toFixed(2)+'px';lastHeight=desired;}
      return now-started<settings.durationMs;
    },
    report(){return{weight,aspect,heightPx:lastHeight};},
    dispose(){disposed=true;viewport.style.height='';area.style.maxHeight=originalMaximum;parent.style.justifyContent=originalJustification;},
  };
}
