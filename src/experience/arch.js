import * as THREE from 'three';
import { addSmileDissolve, prepareJourneyMaterial } from './materials.js';
import { disposeObject } from './scene.js';
import { sampleDentalStory, sampleNeighborEntrance } from './dental-story.js';
import { DENTAL_STORY, STORY_TIMING } from './story-config.js';
import { createFloatingTeeth, flightReveal } from './floating-teeth.js';
import { createSmileLayout, measureSmileBounds } from './smile-layout.js';
import { createSmileBacking } from './smile-backing.js';

const smooth = (a,b,value) => { const t=THREE.MathUtils.clamp((value-a)/(b-a),0,1); return t*t*(3-2*t); };

/** Bake a mirror once, including triangle winding and tangent handedness.
 * Materials then see ordinary positive-determinant transforms on both sides.
 */
function mirrorGeometry(source) {
  const geometry = source.clone();
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(-1,1,1));
  const tangent = geometry.attributes.tangent;
  if (tangent) { for (let i=0;i<tangent.count;i++) tangent.setW(i,-tangent.getW(i)); tangent.needsUpdate=true; }
  const indices = geometry.index?.array;
  if (!indices) throw new Error('The anatomical atlas must be indexed.');
  for (let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  geometry.index.needsUpdate=true;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Native seating is kept within each arch. Smile transitions close the
 * maxilla as a unit without moving the measured interdental teaching site.
 */
export function createArch({ manifest, hero, config, renderer, profile, clay=false }) {
  const object = new THREE.Group(); object.name='28 permanent teeth — author-arranged dentition';
  const teeth = new Map(), mirror = new THREE.Matrix4().makeScale(-1,1,1);
  const mirrored = new Map();
  // The live teeth borrow GLTF geometries and texture images. Take ownership
  // before attaching, including partial failures, and release the union once.
  const sourceObjects=new Set([hero.object]);
  const proxies = [];
  let disposed=false, assetsReady=false, visibleCount=1;
  let finalView='smile', smileWeight=1, sceneProgress=0, closureCm=0;
  let floating, smileBounds, smileBacking;
  const crownMix={value:0};
  const crownPosition=new THREE.Vector3(), crownScale=new THREE.Vector3(), crownRotation=new THREE.Quaternion();
  const smileCenter=new THREE.Vector3(), viewFromSmile=new THREE.Vector3();
  for (const entry of manifest.teeth) {
    const upper = entry.fdi < 30;
    const matrix = new THREE.Matrix4().fromArray(entry.matrix);
    const offset = upper ? config.anatomy.upperOffset : config.anatomy.lowerOffset;
    matrix.elements[12]+=offset[0]; matrix.elements[13]+=offset[1]; matrix.elements[14]+=offset[2];
    // Eight local box corners preserve the exact declared transform for fitting
    // before the deferred atlas arrives. These proxies are never in the scene.
    const b=entry.bounds, points=[];
    for(let i=0;i<8;i++) points.push(i&1?b[3]:b[0],i&2?b[4]:b[1],i&4?b[5]:b[2]);
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3)); geometry.computeBoundingBox();
    const proxy = new THREE.Mesh(geometry); proxy.matrixAutoUpdate=false; proxy.matrix.copy(matrix); proxy.updateMatrixWorld(true); proxies.push(proxy);
    teeth.set(entry.fdi,{ entry, upper, matrix, proxy, mesh:null, finish:null, reveal:0 });
  }

  function attach(fdi, source) {
    const item=teeth.get(fdi);
    if (!item || item.mesh) return;
    const mesh=new THREE.Mesh(source.geometry,source.material); mesh.name=`FDI_${fdi}`; mesh.userData.fdi=fdi;
    mesh.matrixAutoUpdate=false; mesh.matrix.copy(item.matrix);
    if (mesh.matrix.determinant()<0) {
      if (!mirrored.has(item.entry.source)) mirrored.set(item.entry.source,mirrorGeometry(source.geometry));
      mesh.geometry=mirrored.get(item.entry.source); mesh.matrix.multiply(mirror);
    }
    item.finish=prepareJourneyMaterial(mesh,config,profile,renderer,clay);
    item.mesh=mesh; item.seatedMatrix=mesh.matrix.clone(); object.add(mesh); mesh.updateMatrixWorld(true);
    item.finish.setReveal(fdi===config.anatomy.hero?1:0);
    item.reveal=fdi===config.anatomy.hero?1:0;
  }
  const heroMesh=hero.meshes.get('ToothExterior')??[...hero.meshes.values()][0];
  const sources=new Map([[config.anatomy.hero,heroMesh]]);
  attach(config.anatomy.hero,heroMesh);
  const heroCenter = new THREE.Vector3().setFromMatrixPosition(teeth.get(config.anatomy.hero).matrix);
  const neighbors = new Map(config.anatomy.neighbors.filter(fdi => fdi !== config.anatomy.hero).map((fdi, index, items) => {
    const item = teeth.get(fdi);
    const outward = new THREE.Vector3().setFromMatrixPosition(item.matrix).sub(heroCenter);
    outward.y = 0;
    outward.normalize().multiplyScalar(profile.compact ? .83 : 1.18);
    outward.y = index === 0 ? .28 : -.21;
    return [fdi, { outward, order: index / Math.max(1, items.length - 1) }];
  }));
  const arrivalTurn = new THREE.Matrix4(), rootPose = new THREE.Matrix4();

  function setRootPose(item, neighbor, placement) {
    rootPose.copy(item.seatedMatrix);
    const translation=rootPose.elements;
    if(item.upper)translation[13]-=closureCm;
    if(neighbor&&sceneProgress>=DENTAL_STORY.neighbors[0]&&placement<1) {
      const remaining=1-placement;
      translation[12]+=neighbor.outward.x*remaining;
      translation[13]+=neighbor.outward.y*remaining;
      translation[14]+=neighbor.outward.z*remaining;
      rootPose.multiply(arrivalTurn.makeRotationY((1-2*neighbor.order)*.24*remaining));
    }
    if(!item.mesh.matrix.equals(rootPose)) {
      item.mesh.matrix.copy(rootPose);
      item.mesh.updateMatrixWorld(true);
    }
  }

  function registerAtlas(atlas) {
    if (sourceObjects.has(atlas.object)) return;
    sourceObjects.add(atlas.object);
    for(const [name,mesh] of atlas.meshes) {
      const source=Number(name.replace('FDI_',''));
      if(!sources.has(source))sources.set(source,mesh);
    }
  }
  function attachFromAtlas(fdi, item) {
    if (item.mesh) return;
    const source=sources.get(item.entry.source);
    if (!source) throw new Error(`Missing anatomical source ${item.entry.node} for FDI ${fdi}`);
    attach(fdi,source);
  }
  function attachNeighbors(atlas) {
    if (disposed) { disposeObject(atlas.object); return; }
    registerAtlas(atlas);
    for (const fdi of neighbors.keys()) attachFromAtlas(fdi,teeth.get(fdi));
  }
  function attachAtlas(atlas, upperMolar) {
    if (disposed) { disposeObject(atlas.object);disposeObject(upperMolar.object);return; }
    sourceObjects.add(upperMolar.object);
    registerAtlas(atlas);
    if (assetsReady) return;
    sources.set(26,upperMolar.meshes.get('ToothExterior')??[...upperMolar.meshes.values()][0]);
    for (const [fdi,item] of teeth) {
      attachFromAtlas(fdi,item);
    }
    floating=createFloatingTeeth(teeth);
    assetsReady=true; object.updateMatrixWorld(true);
  }
  function attachCrowns(atlas) {
    sourceObjects.add(atlas.object);
    const mirroredCrowns=new Map();
    const smileConfig={...config,material:{...config.material,
      enamel:{...config.material.enamel,color:config.smileMaterial.enamelColor,roughness:config.smileMaterial.roughness},
      root:{...config.material.root,color:config.smileMaterial.enamelColor,roughness:.34},
      occlusionStrength:config.smileMaterial.occlusionStrength}};
    for(const item of teeth.values()) {
      const source=atlas.meshes.get('FDI_'+item.entry.source);
      if(!source)throw new Error('Missing crown '+item.entry.source);
      let geometry=source.geometry;
      if(item.entry.reflected) {
        if(!mirroredCrowns.has(item.entry.source))mirroredCrowns.set(item.entry.source,mirrorGeometry(geometry));
        geometry=mirroredCrowns.get(item.entry.source);
      }
      const crown=new THREE.Mesh(geometry,source.material);
      item.crownFinish=prepareJourneyMaterial(crown,smileConfig,profile,renderer,clay);
      addSmileDissolve(item.mesh.material,crownMix,false);
      addSmileDissolve(crown.material,crownMix,true);
      crown.name='Smile crown '+item.entry.fdi;
      crown.userData.smileFdi=item.entry.fdi;
      crown.matrixAutoUpdate=false;
      crown.matrix.copy(item.mesh.matrix);
      crown.visible=false;
      object.add(crown);
      item.crown=crown;
    }
    const layout=createSmileLayout(teeth);
    smileBounds=measureSmileBounds(teeth,layout);
    smileBounds.getCenter(smileCenter);
    smileBacking=createSmileBacking(teeth,layout,config);
    object.add(smileBacking.object);
    for (const [fdi,matrix] of layout) {
      const position=new THREE.Vector3(), rotation=new THREE.Quaternion(), scale=new THREE.Vector3();
      matrix.decompose(position,rotation,scale);
      teeth.get(fdi).smilePose={matrix,position,rotation,scale};
    }
  }
  const sampled={brushPose:{}};
  function setFinalView(view, weight=view==='smile'?1:0) {
    if(view!=='smile'&&view!=='anatomy')throw new RangeError('Unknown final dental view.');
    if(!Number.isFinite(weight))throw new RangeError('Final smile weight must be finite.');
    finalView=view;
    smileWeight=THREE.MathUtils.clamp(weight,0,1);
  }
  function setState(state, rootOpacity) {
    sceneProgress=state.sceneProgress??0;
    closureCm=config.anatomy.smileClosureCm*Math.max(
      (1-smooth(...STORY_TIMING.assemblyClosure,sceneProgress))*smileWeight,
      smooth(...STORY_TIMING.finalClosure,sceneProgress));
    const flying=floating?.update(sceneProgress,closureCm,profile.compact)>0;
    const mix=smileBounds?Math.max(state.assemblyCrownCoverage*smileWeight,state.finalCrownCoverage):0;
    crownMix.value=mix;
    smileBacking?.setCoverage(mix);
    visibleCount=0;
    for (const [fdi,item] of teeth) {
      const hero=fdi===config.anatomy.hero,neighbor=neighbors.get(fdi);
      const placement=neighbor?sampleNeighborEntrance(sceneProgress,neighbor.order):1;
      if(item.mesh&&!flying)setRootPose(item,neighbor,placement);
      const reveal=hero?1:Math.max(
        neighbor?smooth(0,.66,placement):0,
        item.upper?state.upperReveal:state.lowerReveal,
        flightReveal(sceneProgress,fdi));
      item.reveal=reveal;
      item.finish?.setReveal(mix===1?0:reveal*(rootOpacity?.(fdi,sceneProgress)??1));
      if(item.crown) {
        item.crownFinish.setReveal(mix>0?reveal:0);
        if(mix>0) {
          const pose=item.smilePose;
          if(mix===1)item.crown.matrix.copy(pose.matrix);
          else {
            item.mesh.matrix.decompose(crownPosition,crownRotation,crownScale);
            crownPosition.lerp(pose.position,mix);
            crownRotation.slerp(pose.rotation,mix);
            crownScale.lerp(pose.scale,mix);
            item.crown.matrix.compose(crownPosition,crownRotation,crownScale);
            // During the dissolve the crown and its rooted counterpart share
            // the same seating motion, so enamel contours do not split.
            item.mesh.matrix.copy(item.crown.matrix);
            item.mesh.updateMatrixWorld(true);
          }
          item.crown.updateMatrixWorld(true);
          // Shadow maps use only one surface per tooth during the handover.
          const crownCasts=mix>0.4+(fdi%10)*0.025;
          item.mesh.castShadow=!crownCasts&&item.mesh.visible;
          item.crown.castShadow=crownCasts&&item.crown.visible;
        }
      }
      if(item.mesh&&reveal>.00001)visibleCount++;
    }
  }
  function setProgress(p){setState(sampleDentalStory(p,sampled));}
  function updateView(camera) {
    if(!smileBacking||crownMix.value===0)return;
    object.worldToLocal(viewFromSmile.copy(camera.position)).sub(smileCenter);
    const forward=viewFromSmile.z/Math.max(viewFromSmile.length(),1e-6);
    smileBacking.setViewFactor(smooth(.08,.5,forward));
  }
  // The scene can acquire its later assets while the live teeth are moving.
  // Camera fits always use their fixed authored seats.
  const selection=(filter)=>[...teeth.values()].filter(filter).map(i=>i.proxy);
  const landmarks={
    hero:()=>teeth.get(config.anatomy.hero).proxy,
    neighbors:()=>selection((i)=>config.anatomy.neighbors.includes(i.entry.fdi)),
    arch:()=>selection((i)=>i.upper===(config.anatomy.hero<30)),
    full:()=>selection(()=>true),
    flight:()=>selection(()=>true),
    smile:()=>smileBounds,
  };
  function report() {
    return [...teeth].map(([fdi,item])=>({fdi,source:item.entry.source,loaded:Boolean(item.mesh),reveal:item.mesh?item.reveal:0,worldMatrix:(item.mesh?.matrixWorld??item.matrix).toArray(),triangles:item.mesh?(item.mesh.geometry.index?.count??item.mesh.geometry.attributes.position.count)/3:0}));
  }
  function dispose() {
    if(disposed)return; disposed=true;
    for(const item of teeth.values()){item.finish?.dispose();item.crownFinish?.dispose();}
    const owned=new THREE.Group();owned.add(object,...sourceObjects);
    disposeObject(owned);sourceObjects.clear();
    for(const proxy of proxies) {proxy.geometry.dispose();proxy.material.dispose();}
    mirrored.clear(); teeth.clear();
  }
  return { object,teeth,landmarks,attachNeighbors,attachAtlas,attachCrowns,setState,setProgress,setFinalView,updateView,report,dispose,ownsSource(source){return sourceObjects.has(source?.object);},get finalView(){return finalView;},get closureCm(){return closureCm;},get crownMix(){return crownMix.value;},get assetsReady(){return assetsReady;},get visibleCount(){return visibleCount;} };
}
