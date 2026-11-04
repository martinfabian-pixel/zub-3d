/** Native vertical scroll in presentation, direct orbit on every tooth. The
 * explicit free mode changes touch-action BEFORE a new gesture starts.
 * This module never writes a camera or a story progress value.
 */
export function createModelGestures({canvas,view,config,signal,onChange,onStart,onEnd}) {
  const pointers=new Map();let free=false,pinching=false,pinchDistance=0,enabled=true;
  function firstTwo(){const a=[...pointers.values()];return a.length<2?null:a;}
  const distance=pair=>Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
  function down(e){
    if(!enabled||(e.pointerType==='mouse'&&e.button!==0))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
    canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
    const pair=firstTwo();pinching=Boolean(pair);if(pair)pinchDistance=distance(pair);
    canvas.style.cursor='grabbing';onStart();
  }
  function move(e){
    const previous=pointers.get(e.pointerId);if(!previous||!enabled)return;
    const dx=e.clientX-previous.x,dy=e.clientY-previous.y;previous.x=e.clientX;previous.y=e.clientY;
    const pair=firstTwo();
    if(pair){
      const next=distance(pair);if(pinchDistance>0&&next>0)view.zoomBy(pinchDistance/next);
      pinchDistance=next;pinching=true;if(e.cancelable)e.preventDefault();onChange();return;
    }
    if(pinching){pinching=false;return;}
    const speed=(config.interaction.gestureRotateSpeed??.65)*2*Math.PI/Math.max(200,canvas.clientHeight);
    // pan-y lets the browser cancel a vertical touch; do not apply its Y axis
    // to the model first. Free mode uses both axes on this canvas only.
    if(e.pointerType!=='mouse'&&!free&&Math.abs(dy)>Math.abs(dx)*1.2)return;
    view.orbit(-dx*speed,(free||e.pointerType==='mouse')?-dy*speed:0);
    if(e.cancelable&&(free||e.pointerType==='mouse'))e.preventDefault();onChange();
  }
  function up(e){
    if(!pointers.delete(e.pointerId))return;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    pinchDistance=0;pinching=pointers.size>1;
    if(!pointers.size){canvas.style.cursor='grab';onEnd();}
  }
  canvas.style.touchAction='pan-y';canvas.style.cursor='grab';
  canvas.addEventListener('pointerdown',down,{signal});canvas.addEventListener('pointermove',move,{signal,passive:false});
  canvas.addEventListener('pointerup',up,{signal});canvas.addEventListener('pointercancel',up,{signal});
  canvas.addEventListener('lostpointercapture',up,{signal});
  canvas.addEventListener('wheel',e=>{
    if(!enabled||!free)return;
    e.preventDefault();view.zoomBy(Math.exp(MathUtilsClamp(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1)*.0012,-.3,.3)));onChange();
  },{signal,passive:false});
  canvas.addEventListener('contextmenu',e=>{if(free)e.preventDefault();},{signal});
  return {
    setFree(value){free=Boolean(value);canvas.style.touchAction=free?'none':'pan-y';},
    set enabled(value){enabled=Boolean(value);},get enabled(){return enabled;},
    dispose(){pointers.clear();},
  };
}
function MathUtilsClamp(n,a,b){return Math.max(a,Math.min(b,n));}
