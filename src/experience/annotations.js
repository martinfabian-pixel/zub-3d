import { Matrix4, Vector3 } from 'three';
import { anchorWorld, createSurfaceAnchors, createVisibilityTest } from './annotation-surfaces.js';
import './annotations.css';

const labels={space:'Medzizubný priestor',plaque:'Povlak',cleaned:'Vyčistený povrch'};
const anatomyLabels={enamel:'Sklovina',dentin:'Dentín',pulp:'Dreň'};
const anatomyActions={enamel:'Preskúmať sklovinu',dentin:'Preskúmať dentín',pulp:'Preskúmať dreň'};
const chapterLabels={space:['space'],plaque:['plaque']};
const namespace='http://www.w3.org/2000/svg';
const overlaps=(a,b,p=0)=>a.x<b.x+b.width+p&&a.x+a.width>b.x-p&&a.y<b.y+b.height+p&&a.y+a.height>b.y-p;
const relative=(r,base)=>({x:r.left-base.left,y:r.top-base.top,width:r.width,height:r.height});
const labelReaches=[1,1.5],anatomyReaches=[1,1.5,2.4,3.2];

function overlapArea(a,b) {
  return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*
    Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
}

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

function place(point,width,height,bounds,obstacles,previous,anatomy) {
  const [x,y]=point,margin=9;
  const gap=Math.min(42,Math.max(24,bounds.width*.045));
  const step=Math.min(44,Math.max(28,bounds.height*.055));
  let best=null;
  // Prefer a nearby pill; retain above/below options so a narrow phone never
  // needs a long leader merely to fit a two-line caption beside the anchor.
  for(const dir of [-1,0,1])for(const v of [-1,0,1,-2,2])for(const reach of anatomy?anatomyReaches:labelReaches) {
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
    if(anatomy?.protectedPoints.some(r=>overlaps(rect,r,3)))continue;
    const key=dir+'/'+v+'/'+reach;
    const score=(dir===-1?0:dir===0?4:9)+Math.abs(v+1)*4+(reach-1)*16+
      Math.hypot(end[0]-x,end[1]-y)*.07-(previous===key?6:0)+
      (anatomy?.modelBounds?overlapArea(rect,anatomy.modelBounds)/(width*height)*75:0);
    if(!best||score<best.score)best={key,score,rect,leader:[point,joint,end]};
  }
  return best;
}

/** The scene shares one non-interactive SVG for leaders and HTML labels.
 * Projection follows the exact render camera, including its view offset.
 */
export function createAnnotations({layer,canvas,site,arch,compact=false,requestRender,getAnatomyAnchors,onAnatomySelect}) {
  if(!layer||!canvas)throw new Error('The shared scene needs an annotation layer and canvas.');
  let anchors=site?createSurfaceAnchors(site,arch,compact):null;
  const visibility=createVisibilityTest(arch);
  const doc=layer.ownerDocument,svg=doc.createElementNS(namespace,'svg'),entries={},anatomyEntries={};
  const abort=new AbortController(),stage=layer.closest('#journey-stage');
  const anatomyLayer=stage.querySelector('#healthy-anatomy');
  // Keep the SVG and hygiene captions decorative. Focusable anatomy pills
  // belong to the existing anatomy controls and use these same SVG leaders.
  svg.setAttribute('aria-hidden','true');layer.setAttribute('aria-hidden','true');layer.append(svg);
  const summary=doc.createElement('span');summary.className='journey-annotation-description';
  summary.id='journey-annotation-description';layer.after(summary);
  const description=canvas.getAttribute('aria-describedby')??'';
  canvas.setAttribute('aria-describedby',[description,summary.id].filter(Boolean).join(' '));
  function createEntry(id,text,isAnatomy) {
    const label=doc.createElement(isAnatomy?'button':'span'),group=doc.createElementNS(namespace,'g');
    const path=doc.createElementNS(namespace,'path'),dot=doc.createElementNS(namespace,'circle');
    const copy=doc.createElement('span');copy.className='annotation-copy';copy.textContent=text;
    label.dataset.annotationId=id;label.append(copy);label.hidden=true;
    (isAnatomy?anatomyLayer:layer).append(label);
    group.dataset.leaderFor=id;group.setAttribute('hidden','');dot.setAttribute('r',isAnatomy?'2.5':'3');
    group.append(path,dot);svg.append(group);
    if(isAnatomy) {
      label.type='button';label.dataset.anatomyAnnotation='';
      label.setAttribute('aria-label',anatomyActions[id]);
      label.setAttribute('aria-pressed','false');
      label.addEventListener('click',()=>onAnatomySelect?.(id),{signal:abort.signal});
    }
    return {label,group,path,dot,key:null,data:{id,text,anchor:anchors?.[id],visible:false,reason:'chapter'}};
  }
  for(const [id,text] of Object.entries(labels))entries[id]=createEntry(id,text,false);
  if(anatomyLayer)for(const [id,text] of Object.entries(anatomyLabels))anatomyEntries[id]=createEntry(id,text,true);
  const world=new Vector3(),projected=new Vector3(),cameraSpace=new Vector3();
  const matrix=new Matrix4(),projection=new Matrix4();let signature='',chapter='',disposed=false;
  const obstacleNodes=[...stage.querySelectorAll('[data-annotation-obstacle]')];
  const anatomyObstacles=[...obstacleNodes.filter(node=>!node.classList.contains('journey-copy')),
    ...stage.querySelectorAll('.healthy-anatomy-copy, #journey-status')];
  let revision=0;
  const observer=new ResizeObserver(()=>{revision++;requestRender?.();});
  for(const item of new Set([layer,canvas,...obstacleNodes,...anatomyObstacles]))observer.observe(item);

  function project(camera,base,sensor) {
    cameraSpace.copy(world).applyMatrix4(camera.matrixWorldInverse);
    projected.copy(world).project(camera);
    const point=[(projected.x*.5+.5)*sensor.width+sensor.left-base.left,
      (.5-projected.y*.5)*sensor.height+sensor.top-base.top];
    let reason='clear';
    if(cameraSpace.z>=-camera.near)reason='behind-camera';
    else if(projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1||
      point[0]<2||point[1]<2||point[0]>base.width-2||point[1]>base.height-2)reason='offscreen';
    return {point,reason};
  }
  function assess(id,camera,base,sensor) {
    const anchor=anchors?.[id];
    if(!anchor)return {id,text:labels[id],reason:'awaiting-surface'};
    anchorWorld(anchor,arch,world);
    const measure=project(camera,base,sensor);
    if(measure.reason==='clear'&&visibility.blocked(world,camera))measure.reason='occluded';
    return {id,text:labels[id],anchor,world:world.toArray(),...measure};
  }
  function assessAnatomy({id,object,local},camera,base,sensor) {
    world.copy(local).applyMatrix4(object.matrixWorld);
    return {id,text:anatomyLabels[id],anchor:{local:local.toArray(),object:object.name},world:world.toArray(),
      ...project(camera,base,sensor)};
  }
  function anatomyBounds(camera,base,sensor) {
    const mesh=arch.teeth.get(36)?.mesh;
    const bounds=mesh?.geometry.boundingBox;
    if(!bounds)return null;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(let i=0;i<8;i++) {
      world.set(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z)
        .applyMatrix4(mesh.matrixWorld);
      const {point:[x,y],reason}=project(camera,base,sensor);
      if(reason==='behind-camera')continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    return Number.isFinite(left)?{x:left,y:top,width:right-left,height:bottom-top}:null;
  }
  function hide(entry,reason,measure) {
    entry.label.hidden=true;entry.group.setAttribute('hidden','');
    entry.data={id:entry.data.id,text:entry.data.text,anchor:entry.data.anchor,...measure,visible:false,reason};
  }
  function show(entry,measure,fit) {
    entry.key=fit.key;entry.label.style.transform='translate('+fit.rect.x.toFixed(2)+'px,'+fit.rect.y.toFixed(2)+'px)';
    entry.path.setAttribute('d',fit.leader.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' '));
    entry.dot.setAttribute('cx',measure.point[0]);entry.dot.setAttribute('cy',measure.point[1]);entry.group.removeAttribute('hidden');
    entry.data={...measure,visible:true,reason:'visible',rect:fit.rect,leader:fit.leader};
  }
  function showAnatomy(anatomy,camera,base,sensor) {
    const candidates=new Map();
    for(const anchor of getAnatomyAnchors?.(camera,anatomy.layer)??[]) {
      if(!anatomyEntries[anchor.id])continue;
      if(!candidates.has(anchor.id))candidates.set(anchor.id,[]);
      candidates.get(anchor.id).push(assessAnatomy(anchor,camera,base,sensor));
    }
    const obstacles=anatomyObstacles.map(node=>relative(node.getBoundingClientRect(),base)).filter(r=>r.width>0&&r.height>0);
    const placement={modelBounds:anatomyBounds(camera,base,sensor),protectedPoints:[]};
    const ids=[anatomy.layer,'pulp','dentin','enamel'].filter((id,i,all)=>anatomyEntries[id]&&all.indexOf(id)===i);
    for(const measures of candidates.values()) {
      const first=measures.find(measure=>measure.reason==='clear');
      if(first)placement.protectedPoints.push({x:first.point[0]-9,y:first.point[1]-9,width:18,height:18});
    }
    for(const id of ids) {
      const entry=anatomyEntries[id],measures=candidates.get(id)??[];
      const clear=measures.filter(measure=>measure.reason==='clear');
      if(!clear.length){hide(entry,measures[0]?.reason??'layer-hidden',measures[0]);continue;}
      entry.label.hidden=false;
      const pressed=String(anatomy.highlight===id);
      if(entry.label.getAttribute('aria-pressed')!==pressed)entry.label.setAttribute('aria-pressed',pressed);
      entry.label.toggleAttribute('data-active',anatomy.layer===id);
      const width=entry.label.offsetWidth,height=entry.label.offsetHeight;
      let best=null;
      for(const measure of clear) {
        const fit=place(measure.point,width,height,base,obstacles,entry.key,placement);
        if(fit&&(!best||fit.score<best.fit.score))best={fit,measure};
      }
      if(!best){hide(entry,'layout',clear[0]);continue;}
      show(entry,best.measure,best.fit);
      obstacles.push(best.fit.rect);
    }
  }
  function update({state,camera,brush,anatomy}) {
    if(disposed||!state||!camera)return;
    const base=layer.getBoundingClientRect(),sensor=canvas.getBoundingClientRect();
    const isResult=state.chapterId==='brush'&&state.resultVisibility>.03;
    const ids=isResult?['cleaned']:chapterLabels[state.chapterId]??[];
    const group=isResult?'cleaned':state.chapterId;
    const ready=Boolean(anchors)&&state.neighborsReveal>.95&&(!brush?.object.visible)&&
      (state.chapterId!=='plaque'||state.plaqueDeposition>.08);
    const anatomyActive=state.chapterId==='anatomy'&&anatomy?.active&&anatomy.cut>.001;
    // Progress also drives the copy's small CSS translation at boundaries;
    // that transform can change its exclusion zone without firing resize.
    const key=[revision,state.chapterId,state.sceneProgress,ready,anatomyActive,anatomy?.amount,anatomy?.cut,anatomy?.layer,anatomy?.highlight,
      base.left,base.top,base.width,base.height,
      sensor.left,sensor.top,sensor.width,sensor.height].join('/');
    if(signature===key&&matrix.equals(camera.matrixWorld)&&projection.equals(camera.projectionMatrix))return;
    signature=key;matrix.copy(camera.matrixWorld);projection.copy(camera.projectionMatrix);
    if(chapter!==group) {
      chapter=group;summary.textContent=ids.map(id=>labels[id]).join('. ');
      for(const entry of [...Object.values(entries),...Object.values(anatomyEntries)])entry.key=null;
    }
    for(const [id,entry] of Object.entries(entries)) {
      if(!ids.includes(id)||!ready)hide(entry,ids.includes(id)?'awaiting-surface':'chapter');
    }
    const hiddenReason=group==='anatomy'?'layer-hidden':'chapter';
    if(anatomyActive)showAnatomy(anatomy,camera,base,sensor);
    else for(const entry of Object.values(anatomyEntries)) {
      if(!entry.data.visible&&entry.data.reason===hiddenReason&&!entry.data.anchor)continue;
      entry.label.removeAttribute('data-active');
      entry.label.setAttribute('aria-pressed','false');
      hide(entry,hiddenReason,{anchor:null});
    }
    if(!ready||!ids.length)return;
    const obstacles=obstacleNodes.map(n=>relative(n.getBoundingClientRect(),base)).filter(r=>r.width>0&&r.height>0);
    for(const id of ids) {
      const entry=entries[id],measure=assess(id,camera,base,sensor);
      if(measure.reason!=='clear'){hide(entry,measure.reason,measure);continue;}
      entry.label.hidden=false;
      const fit=place(measure.point,entry.label.offsetWidth,entry.label.offsetHeight,base,obstacles,entry.key);
      if(!fit){hide(entry,'layout',measure);continue;}
      show(entry,measure,fit);
    }
  }
  function probe(id,camera){return assess(id,camera,layer.getBoundingClientRect(),canvas.getBoundingClientRect());}
  function report(){return {chapter,labels:Object.values(entries).map(entry=>structuredClone(entry.data)),
    anatomyLabels:Object.values(anatomyEntries).map(entry=>structuredClone(entry.data))};}
  function dispose(){
    if(disposed)return;disposed=true;abort.abort();observer.disconnect();visibility.dispose();svg.remove();summary.remove();
    for(const entry of [...Object.values(entries),...Object.values(anatomyEntries)])entry.label.remove();
    if(description)canvas.setAttribute('aria-describedby',description);else canvas.removeAttribute('aria-describedby');
  }
  function setTeachingSite(nextSite) {
    anchors=createSurfaceAnchors(nextSite,arch,compact);
    for(const [id,entry] of Object.entries(entries))entry.data.anchor=anchors[id];
    revision++;requestRender?.();
  }
  return {update,probe,report,dispose,setTeachingSite};
}
