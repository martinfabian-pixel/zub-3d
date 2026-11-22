import * as THREE from 'three';
import { addSmileDissolve, crownRevealThreshold, prepareJourneyMaterial } from './materials.js';
import { disposeObject } from './scene.js';
import { sampleDentalStory } from './dental-story.js';
import { DENTAL_STORY, STORY_TIMING } from './story-config.js';
import { createFloatingTeeth, flightReveal } from './floating-teeth.js';
import { createSmileLayout, measureSmileBounds } from './smile-layout.js';
import { createSmileBacking } from './smile-backing.js';
import { createOcclusalMap } from './occlusal-map.js';

const smooth = (a,b,value) => { const t=THREE.MathUtils.clamp((value-a)/(b-a),0,1); return t*t*(3-2*t); };

/** Bake a mirror once, including triangle winding and tangent handedness.
 * Materials then see ordinary positive-determinant transforms on both sides.
 */
function mirrorGeometry(source) {
  const geometry = source.clone();
  for(const attribute of [geometry.attributes.position,geometry.attributes.normal,geometry.attributes.tangent]){
    if(attribute)for(let i=0;i<attribute.count;i++)attribute.setX(i,-attribute.getX(i));
  }
  const tangent = geometry.attributes.tangent;
  if (tangent) { for (let i=0;i<tangent.count;i++) tangent.setW(i,-tangent.getW(i)); tangent.needsUpdate=true; }
  const indices = geometry.index?.array;
  if (!indices) throw new Error('The anatomical atlas must be indexed.');
  for (let i=0;i<indices.length;i+=3) {
    const b=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=b;
  }
  geometry.index.needsUpdate=true;
  if(geometry.boundingBox){
    const {min,max}=geometry.boundingBox;
    const left=min.x; min.x=-max.x; max.x=-left;
  }else geometry.computeBoundingBox();
  if(geometry.boundingSphere)geometry.boundingSphere.center.x*=-1;
  else geometry.computeBoundingSphere();
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
  let floating, smileBounds, smileBacking, rootedAtlas, occlusalMap;
  let mapSelection=config.anatomy.hero, mapOpening=0, siteEmphasis=0;
  const siteTint = new THREE.Color(.46, .86, .94);
  let crownMix=0;
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
    if(fdi===DENTAL_STORY.fdi.hero||fdi===DENTAL_STORY.fdi.distalNeighbor)
      item.siteNeutral=mesh.material.color.clone();
    // Keep the live molar's program throughout loading. Installing the
    // dissolve when the crowns arrive recompiles its visible surface mid-turn.
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const {min,max}=mesh.geometry.boundingBox;
    item.smileExtent={value:new THREE.Vector2(min.y,1/(max.y-min.y))};
    item.smileMix={value:0};
    // The back pairs seat first; the incisors finish together near the
    // centre. Each neighbouring pair substantially overlaps the preceding one.
    item.smileStart=(7-fdi%10)*.05+(item.upper?0:.025);
    addSmileDissolve(mesh.material,item.smileMix,item.smileExtent,false);
    item.mesh=mesh; item.seatedMatrix=mesh.matrix.clone(); object.add(mesh); mesh.updateMatrixWorld(true);
    item.finish.setReveal(fdi===config.anatomy.hero?1:0);
    item.reveal=fdi===config.anatomy.hero?1:0;
  }
  const heroMesh=hero.meshes.get('ToothExterior')??[...hero.meshes.values()][0];
  const sources=new Map([[config.anatomy.hero,heroMesh]]);
  attach(config.anatomy.hero,heroMesh);
  const neighbors = new Set(config.anatomy.neighbors.filter(fdi => fdi !== config.anatomy.hero));
  const rootPose = new THREE.Matrix4();

  function setRootPose(item, extraction) {
    rootPose.copy(item.seatedMatrix);
    if(item.upper)rootPose.elements[13]-=closureCm;
    if(extraction>0){
      const [x,y,z]=DENTAL_STORY.extractionOffset;
      rootPose.elements[12]+=x*extraction;
      rootPose.elements[13]+=y*extraction;
      rootPose.elements[14]+=z*extraction;
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
  async function attachAtlas(atlas, upperMolar, afterPaint) {
    if (disposed) { disposeObject(atlas.object);disposeObject(upperMolar.object);return; }
    sourceObjects.add(upperMolar.object);
    registerAtlas(atlas);
    if (assetsReady) return;
    rootedAtlas=atlas.meshes;
    sources.set(26,upperMolar.meshes.get('ToothExterior')??[...upperMolar.meshes.values()][0]);
    let batchStart=performance.now();
    for (const [fdi,item] of teeth) {
      attachFromAtlas(fdi,item);
      if(afterPaint&&performance.now()-batchStart>=8){
        await afterPaint();
        if(disposed)return;
        batchStart=performance.now();
      }
    }
    floating=createFloatingTeeth(teeth);
    assetsReady=true; object.updateMatrixWorld(true);
  }
  async function attachCrowns(atlas, afterPaint) {
    sourceObjects.add(atlas.object);
    const mirroredCrowns=new Map();
    const smileConfig={...config,material:{...config.material,
      enamel:{...config.material.enamel,color:config.smileMaterial.enamelColor,roughness:config.smileMaterial.roughness},
      root:{...config.material.root,color:config.smileMaterial.enamelColor,roughness:.34},
      occlusionStrength:config.smileMaterial.occlusionStrength}};
    let batchStart=performance.now();
    for(const item of teeth.values()) {
      const source=atlas.meshes.get('FDI_'+item.entry.source);
      if(!source)throw new Error('Missing crown '+item.entry.source);
      let geometry=source.geometry;
      if(item.entry.reflected) {
        if(!mirroredCrowns.has(item.entry.source))mirroredCrowns.set(item.entry.source,mirrorGeometry(geometry));
        geometry=mirroredCrowns.get(item.entry.source);
      }
      // The cropped crowns retain the source UVs. Reuse the resident dental
      // maps for this device instead of uploading a second desktop atlas
      // as the crowns first enter the picture. The standalone hero 36 has
      // different UVs, so use the atlas source of its crown here too.
      const rootSource=rootedAtlas.get('FDI_'+item.entry.source)??sources.get(item.entry.source);
      const crown=new THREE.Mesh(geometry,rootSource.material);
      item.crownFinish=prepareJourneyMaterial(crown,smileConfig,profile,renderer,clay,item.entry.fdi);
      if(item.entry.fdi===config.anatomy.hero){
        item.crownNeutral=crown.material.color.clone();
        item.crownLocated=item.crownNeutral.clone().multiply(new THREE.Color(.68,.94,1.03));
      }
      addSmileDissolve(crown.material,item.smileMix,item.smileExtent,true);
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      item.crownThreshold=crownRevealThreshold(geometry.boundingBox.min.y,item.smileExtent.value);
      crown.name='Smile crown '+item.entry.fdi;
      crown.userData.smileFdi=item.entry.fdi;
      crown.matrixAutoUpdate=false;
      crown.matrix.copy(item.mesh.matrix);
      crown.visible=false;
      object.add(crown);
      item.crown=crown;
      if(afterPaint&&performance.now()-batchStart>=8){
        await afterPaint();
        if(disposed)return;
        batchStart=performance.now();
      }
    }
    const layout=createSmileLayout(teeth);
    if(afterPaint)await afterPaint();
    if(disposed)return;
    const bounds=measureSmileBounds(teeth,layout);
    if(afterPaint)await afterPaint();
    if(disposed)return;
    smileBacking=createSmileBacking(teeth,layout,config);
    object.add(smileBacking.object);
    for (const [fdi,matrix] of layout) {
      const position=new THREE.Vector3(), rotation=new THREE.Quaternion(), scale=new THREE.Vector3();
      matrix.decompose(position,rotation,scale);
      teeth.get(fdi).smilePose={matrix,position,rotation,scale};
    }
    smileBounds=bounds;
    smileBounds.getCenter(smileCenter);
    occlusalMap=createOcclusalMap(teeth,layout);
  }
  const sampled={brushPose:{}};
  function updateMapTint(fdi,item) {
    item?.crownFinish?.setMapEmphasis(Math.max(item.siteNeutral?siteEmphasis*.53:0,fdi===mapSelection?mapOpening:0));
  }
  function setMapSelection(fdi) {
    const previous=mapSelection;
    mapSelection=teeth.has(fdi)?fdi:config.anatomy.hero;
    if(mapOpening&&mapSelection!==previous) {
      updateMapTint(previous,teeth.get(previous));
      updateMapTint(mapSelection,teeth.get(mapSelection));
    }
  }
  function mapAnchor(fdi, out) {
    const anchor=occlusalMap?.anchors.get(fdi), crown=teeth.get(fdi)?.crown;
    return anchor&&crown ? out.copy(anchor).applyMatrix4(crown.matrixWorld) : null;
  }
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
    const flying=state.openingFlight&&floating?.update(sceneProgress,closureCm,profile.compact)>0;
    const mix=smileBounds?Math.max(state.assemblyCrownCoverage*smileWeight,state.finalCrownCoverage):0;
    crownMix=mix;
    const lower=state.mapLower??0, upper=state.mapUpper??0;
    mapOpening=Math.max(lower,upper);
    const updateSite=siteEmphasis!==(state.mapSite??0);
    siteEmphasis=state.mapSite??0;
    if(mapOpening)occlusalMap?.sample(lower,upper);
    smileBacking?.setCoverage(mix*(1-mapOpening));
    visibleCount=0;
    for (const [fdi,item] of teeth) {
      const hero=fdi===config.anatomy.hero;
      if(item.mesh&&!flying)setRootPose(item,hero?state.toothExtraction:0);
      const assembly=state.openingFlight?flightReveal(sceneProgress,fdi)
        :neighbors.has(fdi)?state.neighborsReveal:state.assemblyReveal;
      const reveal=hero?1:Math.max(
        item.upper?state.upperReveal:state.lowerReveal,
        assembly);
      item.reveal=reveal;
      // Sample each overlap from the story, including reversed or interrupted
      // transitions. At either endpoint every seat is exactly in registration.
      // The visibility decision must use the same precision as the shader.
      // At the tail of easing a JS double may still be below a GPU float of 1.
      const seat=mix===0||mix===1?mix:Math.fround(smooth(item.smileStart,item.smileStart+.675,mix));
      if(item.mesh)item.smileMix.value=seat;
      if(item.siteNeutral&&updateSite)item.finish.material.color.lerpColors(item.siteNeutral,siteTint,siteEmphasis);
      item.finish?.setReveal(seat===1?0:reveal*(rootOpacity?.(fdi,sceneProgress)??1));
      if(item.crown) {
        // The rooted representation has its own enamel locator. Carry the
        // same cool cue on the visible crown before and during the handoff.
        if(hero)item.crown.material.color.lerpColors(item.crownNeutral,item.crownLocated,state.locate36);
        updateMapTint(fdi,item);
        item.crownFinish.setReveal(seat>item.crownThreshold?reveal:0);
        // Move the complete arch on one easing curve. Only the tissue
        // handover is staggered, so the fronts never have to catch up.
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
          const crownCasts=seat>item.crownThreshold;
          item.mesh.castShadow=!crownCasts&&item.mesh.visible;
          item.crown.castShadow=crownCasts&&item.crown.visible;
        }
      }
      if(occlusalMap && (item.upper?upper:lower)>0) {
        const turn=item.upper?occlusalMap.upper:occlusalMap.lower;
        // Apply after the root-to-crown handover has registered both meshes.
        // The rooted teeth stay continuous even when the map starts unfolding
        // before their crown representations have fully taken over.
        if(item.mesh.visible){item.mesh.matrix.premultiply(turn);item.mesh.updateMatrixWorld(true);}
        if(item.crown.visible){item.crown.matrix.premultiply(turn);item.crown.updateMatrixWorld(true);}
      }
      if(item.mesh&&reveal>.00001)visibleCount++;
    }
  }
  function setProgress(p){setState(sampleDentalStory(p,sampled));}
  function updateView(camera) {
    if(!smileBacking||crownMix===0)return;
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
    map:()=>occlusalMap?.bounds??selection(()=>true),
    mapLower:()=>occlusalMap?.lowerBounds??selection(i=>!i.upper),
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
    rootedAtlas=null;mirrored.clear(); teeth.clear();
  }
  return { object,teeth,landmarks,attachNeighbors,attachAtlas,attachCrowns,setState,setProgress,setFinalView,setMapSelection,mapAnchor,updateView,report,dispose,
    ownsSource(source){return sourceObjects.has(source?.object);},get finalView(){return finalView;},get closureCm(){return closureCm;},get crownMix(){return crownMix;},get assetsReady(){return assetsReady;},get visibleCount(){return visibleCount;} };
}
