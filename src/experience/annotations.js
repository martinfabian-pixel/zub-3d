import { Matrix4, Vector3 } from 'three';
import { anchorWorld, createSurfaceAnchors, createVisibilityTest } from './annotation-surfaces.js';
import './annotations.css';

const labels={space:'Medzizubný priestor',plaque:'Povlak',caries:'Kaz',cleaned:'Vyčistený povrch',persistent:'Kaz vyžaduje ošetrenie'};
const chapterLabels={space:['space'],plaque:['plaque'],caries:['caries'],result:['cleaned']};
const namespace='http://www.w3.org/2000/svg';
const overlaps=(a,b,p=0)=>a.x<b.x+b.width+p&&a.x+a.width>b.x-p&&a.y<b.y+b.height+p&&a.y+a.height>b.y-p;
const relative=(r,base)=>({x:r.left-base.left,y:r.top-base.top,width:r.width,height:r.height});

// Liang–Barsky intervals for a segment and an axis-aligned screen rectangle.
function interval(a,b,r,pad=0) {
  let lo=0,hi=1;
  for(let axis=0;axis<2;axis++) {
    const start=axis?r.y:r.x,size=axis?r.height:r.width,s=a[axis],d=b[axis]-s;
    if(Math.abs(d)<1e-9) { if(s<start-pad||s>start+size+pad)return null;continue; }
    const u=(start-pad-s)/d,v=(start+size+pad-s)/d;
    lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
    if(lo>hi)return null;
  }
  return [lo,hi];
}

function crosses(a,b,c,d) {
  const side=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  return side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0;
}

function place(id,point,width,height,bounds,obstacles,floor,occupied,previous) {
  const [x,y]=point,margin=9;
  const side=id==='persistent'?1:-1;
  const rise=id==='persistent'?1:-1;
  const gap=Math.min(42,Math.max(24,bounds.width*.045));
  const step=Math.min(44,Math.max(28,bounds.height*.055));
  const reaches=id==='persistent'&&bounds.width<420?[1,1.5,0]:[1,1.5];
  let best=null;
  // Prefer a nearby pill; retain above/below options so a narrow phone never
  // needs a long leader merely to fit a two-line caption beside the anchor.
  for(const dir of [side,0,-side])for(const v of [rise,0,-rise,2*rise,-2*rise])for(const reach of reaches) {
    if(!dir&&!v)continue;
    // Last-resort narrow-phone placement: use the actual space to the edge,
    // with a visible >=10px leader, instead of moving a cavity anchor or
    // allowing the pointer to cross its protected floor. Normal placements
    // always score ahead of this compressed gap.
    const squeezed=reach===0;
    if(squeezed&&!dir)continue;
    const horizontalGap=squeezed?Math.min(gap,dir<0?x-width-margin:bounds.width-margin-x-width):gap*reach;
    if(squeezed&&(horizontalGap<10||horizontalGap>=gap))continue;
    const left=dir?x+dir*horizontalGap-(dir<0?width:0):x-width/2;
    const top=dir?y+v*step-height/2:y+Math.sign(v)*gap*reach+(v<0?-height:0)+(v-Math.sign(v))*step;
    const rect={x:left,y:top,width,height};
    if(left<margin||top<margin||left+width>bounds.width-margin||top+height>bounds.height-margin)continue;
    const end=dir?[dir<0?left+width:left,top+height*.5]:[x,v<0?top+height:top];
    // Keep the report's three-point convention while drawing one quiet,
    // straight segment from the registered surface to the pill's near edge.
    const joint=[(x+end[0])*.5,(y+end[1])*.5];
    if(obstacles.some(r=>overlaps(rect,r,5)||interval(point,joint,r,3)||interval(joint,end,r,3)))continue;
    if(occupied.some(o=>overlaps(rect,o.rect,8)||interval(point,joint,o.rect,3)||interval(joint,end,o.rect,3)||
      interval(o.leader[0],o.leader[1],rect,3)||interval(o.leader[1],o.leader[2],rect,3)||
      crosses(point,joint,o.leader[0],o.leader[1])||crosses(point,joint,o.leader[1],o.leader[2])||
      crosses(joint,end,o.leader[0],o.leader[1])||crosses(joint,end,o.leader[1],o.leader[2])))continue;
    let inside=0;
    if(floor) {
      if(overlaps(rect,floor,4)||interval(joint,end,floor,2))continue;
      const cut=interval(point,joint,floor,1);
      if(cut) {
        // The cavity pointer starts at its own lip. Only its exit from the
        // protection rectangle is allowed, never a route back across the pit.
        inside=(cut[1]-cut[0])*Math.hypot(joint[0]-x,joint[1]-y);
        if(!['caries','persistent'].includes(id)||cut[0]>.001||inside>9)continue;
      }
    }
    const key=dir+'/'+v+'/'+reach;
    const score=inside*3+(dir===side?0:dir===0?4:9)+Math.abs(v-rise)*4+(squeezed?100:(reach-1)*16)+
      Math.hypot(end[0]-x,end[1]-y)*.07-(previous===key?6:0);
    if(!best||score<best.score)best={key,score,rect,leader:[point,joint,end]};
  }
  return best;
}

/** All visible labels use one non-interactive SVG and ordinary HTML type.
 * Projection follows the exact render camera, including its view offset.
 */
export function createAnnotations({layer,canvas,site,arch,compact=false,requestRender}) {
  if(!layer||!canvas)throw new Error('The shared scene needs an annotation layer and canvas.');
  const anchors=createSurfaceAnchors(site,arch,compact),visibility=createVisibilityTest(arch);
  const doc=layer.ownerDocument,svg=doc.createElementNS(namespace,'svg'),entries={};
  svg.setAttribute('aria-hidden','true');layer.setAttribute('aria-hidden','true');layer.append(svg);
  const summary=doc.createElement('span');summary.className='journey-annotation-description';
  summary.id='journey-annotation-description';layer.after(summary);
  const description=canvas.getAttribute('aria-describedby')??'';
  canvas.setAttribute('aria-describedby',[description,summary.id].filter(Boolean).join(' '));
  for(const [id,text] of Object.entries(labels)) {
    const label=doc.createElement('span'),group=doc.createElementNS(namespace,'g');
    const path=doc.createElementNS(namespace,'path'),dot=doc.createElementNS(namespace,'circle');
    const copy=doc.createElement('span');copy.className='annotation-copy';copy.textContent=text;
    label.dataset.annotationId=id;label.append(copy);label.hidden=true;layer.append(label);
    group.dataset.leaderFor=id;group.setAttribute('hidden','');dot.setAttribute('r','3');
    group.append(path,dot);svg.append(group);
    entries[id]={label,group,path,dot,key:null,data:{id,text,anchor:anchors[id],visible:false,reason:'chapter'}};
  }
  const world=new Vector3(),projected=new Vector3(),cameraSpace=new Vector3(),localClip=new Matrix4();
  const matrix=new Matrix4(),projection=new Matrix4();let signature='',chapter='',disposed=false;
  const floorVertices=[],host=arch.teeth.get(36).mesh,regions=host.geometry.attributes.lesionRegion;
  for(let i=0;i<regions.count;i++)if(regions.getY(i)>.40)floorVertices.push(i);
  const obstacleNodes=[...layer.closest('#journey-stage').querySelectorAll('[data-annotation-obstacle]')];
  let revision=0;
  const observer=new ResizeObserver(()=>{revision++;requestRender?.();});
  for(const item of [layer,canvas,...obstacleNodes])observer.observe(item);

  function assess(id,camera,base,sensor) {
    anchorWorld(anchors[id],arch,world);
    const xyz=world.toArray();
    cameraSpace.copy(world).applyMatrix4(camera.matrixWorldInverse);
    projected.copy(world).project(camera);
    const point=[(projected.x*.5+.5)*sensor.width+sensor.left-base.left,
      (.5-projected.y*.5)*sensor.height+sensor.top-base.top];
    let reason='clear';
    if(cameraSpace.z>=-camera.near)reason='behind-camera';
    else if(projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1||
      point[0]<2||point[1]<2||point[0]>base.width-2||point[1]>base.height-2)reason='offscreen';
    else if(visibility.blocked(world,camera))reason='occluded';
    return {id,text:labels[id],anchor:anchors[id],world:xyz,point,reason};
  }
  function protectedFloor(camera,base,sensor) {
    localClip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(host.matrixWorld);
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const i of floorVertices) {
      host.getVertexPosition(i,projected).applyMatrix4(localClip);
      if(projected.z<-1||projected.z>1)continue;
      const x=(projected.x*.5+.5)*sensor.width+sensor.left-base.left;
      const y=(.5-projected.y*.5)*sensor.height+sensor.top-base.top;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    return left<Infinity?{x:left,y:top,width:right-left,height:bottom-top}:null;
  }
  function hide(entry,reason,measure) {
    entry.label.hidden=true;entry.group.setAttribute('hidden','');
    entry.data={id:entry.data.id,text:entry.data.text,anchor:entry.data.anchor,...measure,visible:false,reason};
  }
  function update({state,camera,brush}) {
    if(disposed||!state||!camera)return;
    const base=layer.getBoundingClientRect(),sensor=canvas.getBoundingClientRect();
    const morph=host.morphTargetInfluences?.[0]??0;
    const ids=chapterLabels[state.chapterId]??[];
    const ready=state.neighborsReveal>.95&&(!brush?.object.visible)&&
      (state.chapterId!=='plaque'||state.plaqueDeposition>.08)&&(state.chapterId!=='caries'||state.lesionProgress>.045);
    // Progress also drives the copy's small CSS translation at boundaries;
    // that transform can change its exclusion zone without firing resize.
    const key=[revision,state.chapterId,state.sceneProgress,ready,morph,base.left,base.top,base.width,base.height,
      sensor.left,sensor.top,sensor.width,sensor.height].join('/');
    if(signature===key&&matrix.equals(camera.matrixWorld)&&projection.equals(camera.projectionMatrix))return;
    signature=key;matrix.copy(camera.matrixWorld);projection.copy(camera.projectionMatrix);
    if(chapter!==state.chapterId) {
      chapter=state.chapterId;summary.textContent=ids.map(id=>labels[id]).join('. ');
      for(const entry of Object.values(entries))entry.key=null;
    }
    for(const [id,entry] of Object.entries(entries)) {
      if(!ids.includes(id)||!ready)hide(entry,ids.includes(id)?'awaiting-surface':'chapter');
    }
    if(!ready||!ids.length)return;
    const obstacles=obstacleNodes.map(n=>relative(n.getBoundingClientRect(),base)).filter(r=>r.width>0&&r.height>0);
    const floor=state.lesionProgress>.045?protectedFloor(camera,base,sensor):null;
    const occupied=[];
    for(const id of ids) {
      const entry=entries[id],measure=assess(id,camera,base,sensor);
      if(measure.reason!=='clear'){hide(entry,measure.reason,measure);continue;}
      entry.label.hidden=false;
      const fit=place(id,measure.point,entry.label.offsetWidth,entry.label.offsetHeight,base,obstacles,floor,occupied,entry.key);
      if(!fit){hide(entry,'layout',measure);continue;}
      entry.key=fit.key;entry.label.style.transform='translate('+fit.rect.x.toFixed(2)+'px,'+fit.rect.y.toFixed(2)+'px)';
      entry.path.setAttribute('d',fit.leader.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' '));
      entry.dot.setAttribute('cx',measure.point[0]);entry.dot.setAttribute('cy',measure.point[1]);entry.group.removeAttribute('hidden');
      entry.data={...measure,visible:true,reason:'visible',rect:fit.rect,leader:fit.leader};
      occupied.push(fit);
    }
  }
  function probe(id,camera){return assess(id,camera,layer.getBoundingClientRect(),canvas.getBoundingClientRect());}
  function report(){return {chapter,labels:Object.values(entries).map(entry=>structuredClone(entry.data))};}
  function dispose(){
    if(disposed)return;disposed=true;observer.disconnect();visibility.dispose();svg.remove();summary.remove();
    for(const entry of Object.values(entries))entry.label.remove();
    if(description)canvas.setAttribute('aria-describedby',description);else canvas.removeAttribute('aria-describedby');
  }
  return {update,probe,report,dispose};
}
