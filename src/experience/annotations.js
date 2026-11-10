import { Matrix4, Vector3 } from 'three';
import { anchorWorld, createSurfaceAnchors, createVisibilityTest } from './annotation-surfaces.js';
import './annotations.css';

const labels={space:'Medzizubný priestor',plaque:'Povlak',cleaned:'Vyčistený povrch'};
const chapterLabels={space:['space'],plaque:['plaque'],result:['cleaned']};
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

function place(point,width,height,bounds,obstacles,previous) {
  const [x,y]=point,margin=9;
  const gap=Math.min(42,Math.max(24,bounds.width*.045));
  const step=Math.min(44,Math.max(28,bounds.height*.055));
  let best=null;
  // Prefer a nearby pill; retain above/below options so a narrow phone never
  // needs a long leader merely to fit a two-line caption beside the anchor.
  for(const dir of [-1,0,1])for(const v of [-1,0,1,-2,2])for(const reach of [1,1.5]) {
    if(!dir&&!v)continue;
    const horizontalGap=gap*reach;
    const left=dir?x+dir*horizontalGap-(dir<0?width:0):x-width/2;
    const top=dir?y+v*step-height/2:y+Math.sign(v)*gap*reach+(v<0?-height:0)+(v-Math.sign(v))*step;
    const rect={x:left,y:top,width,height};
    if(left<margin||top<margin||left+width>bounds.width-margin||top+height>bounds.height-margin)continue;
    const end=dir?[dir<0?left+width:left,top+height*.5]:[x,v<0?top+height:top];
    // Keep the report's three-point convention while drawing one quiet,
    // straight segment from the registered surface to the pill's near edge.
    const joint=[(x+end[0])*.5,(y+end[1])*.5];
    if(obstacles.some(r=>overlaps(rect,r,5)||interval(point,joint,r,3)||interval(joint,end,r,3)))continue;
    const key=dir+'/'+v+'/'+reach;
    const score=(dir===-1?0:dir===0?4:9)+Math.abs(v+1)*4+(reach-1)*16+
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
  const world=new Vector3(),projected=new Vector3(),cameraSpace=new Vector3();
  const matrix=new Matrix4(),projection=new Matrix4();let signature='',chapter='',disposed=false;
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
  function hide(entry,reason,measure) {
    entry.label.hidden=true;entry.group.setAttribute('hidden','');
    entry.data={id:entry.data.id,text:entry.data.text,anchor:entry.data.anchor,...measure,visible:false,reason};
  }
  function update({state,camera,brush}) {
    if(disposed||!state||!camera)return;
    const base=layer.getBoundingClientRect(),sensor=canvas.getBoundingClientRect();
    const ids=chapterLabels[state.chapterId]??[];
    const ready=state.neighborsReveal>.95&&(!brush?.object.visible)&&
      (state.chapterId!=='plaque'||state.plaqueDeposition>.08);
    // Progress also drives the copy's small CSS translation at boundaries;
    // that transform can change its exclusion zone without firing resize.
    const key=[revision,state.chapterId,state.sceneProgress,ready,base.left,base.top,base.width,base.height,
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
    for(const id of ids) {
      const entry=entries[id],measure=assess(id,camera,base,sensor);
      if(measure.reason!=='clear'){hide(entry,measure.reason,measure);continue;}
      entry.label.hidden=false;
      const fit=place(measure.point,entry.label.offsetWidth,entry.label.offsetHeight,base,obstacles,entry.key);
      if(!fit){hide(entry,'layout',measure);continue;}
      entry.key=fit.key;entry.label.style.transform='translate('+fit.rect.x.toFixed(2)+'px,'+fit.rect.y.toFixed(2)+'px)';
      entry.path.setAttribute('d',fit.leader.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' '));
      entry.dot.setAttribute('cx',measure.point[0]);entry.dot.setAttribute('cy',measure.point[1]);entry.group.removeAttribute('hidden');
      entry.data={...measure,visible:true,reason:'visible',rect:fit.rect,leader:fit.leader};
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
