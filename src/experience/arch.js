import * as THREE from 'three';
import { prepareJourneyMaterial } from './materials.js';
import { disposeObject } from './scene.js';
import { sampleDentalStory } from './dental-story.js';
import { createFloatingTeeth, floatingAmount } from './floating-teeth.js';

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

/** Native seating is kept within each arch. The single audited final motion
 * translates the maxilla vertically as a unit; the teaching site never moves.
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
  let floating;
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
    item.mesh=mesh; object.add(mesh); mesh.updateMatrixWorld(true);
    item.finish.setReveal(fdi===config.anatomy.hero?1:0);
    item.reveal=fdi===config.anatomy.hero?1:0;
  }
  const heroMesh=hero.meshes.get('ToothExterior')??[...hero.meshes.values()][0];
  const sources=new Map([[config.anatomy.hero,heroMesh]]);
  attach(config.anatomy.hero,heroMesh);

  function attachAtlas(atlas, upperMolar) {
    if (disposed) { disposeObject(atlas.object); return; }
    sourceObjects.add(atlas.object);sourceObjects.add(upperMolar.object);
    sources.set(26,upperMolar.meshes.get('ToothExterior')??[...upperMolar.meshes.values()][0]);
    for(const [name,mesh] of atlas.meshes) {
      const source=Number(name.replace('FDI_',''));
      if(!sources.has(source))sources.set(source,mesh);
    }
    for (const [fdi,item] of teeth) {
      if (item.mesh) continue;
      const source=sources.get(item.entry.source);
      if (!source) throw new Error(`Missing anatomical source ${item.entry.node} for FDI ${fdi}`);
      attach(fdi,source);
    }
    assetsReady=true; object.updateMatrixWorld(true);
    floating=createFloatingTeeth(teeth);
  }
  function attachCrowns(atlas) {
    sourceObjects.add(atlas.object);
    const mirroredCrowns=new Map();
    const smileConfig={...config,material:{...config.material,
      enamel:{...config.material.enamel,color:config.smileMaterial.enamelColor,roughness:config.smileMaterial.roughness},
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
      crown.material.polygonOffset=true;
      crown.material.polygonOffsetFactor=-2;
      crown.material.polygonOffsetUnits=-2;
      crown.name='Smile crown '+item.entry.fdi;
      crown.userData.smileFdi=item.entry.fdi;
      crown.matrixAutoUpdate=false;
      crown.matrix.copy(item.mesh.matrix);
      crown.visible=false;
      object.add(crown);
      item.crown=crown;
    }
  }
  const sampled={brushPose:{}};
  function updateClosure() {
    const [start,end]=config.anatomy.smileClosureRange;
    const next=smileWeight*config.anatomy.smileClosureCm*smooth(start,end,sceneProgress);
    if(next===closureCm)return;
    closureCm=next;
    for(const item of teeth.values()) {
      if(!item.upper||!item.mesh)continue;
      item.mesh.matrix.elements[13]=item.matrix.elements[13]-closureCm;
      item.mesh.updateMatrixWorld(true);
    }
  }
  function setFinalView(view, weight=view==='smile'?1:0) {
    if(view!=='smile'&&view!=='anatomy')throw new RangeError('Unknown final dental view.');
    if(!Number.isFinite(weight))throw new RangeError('Final smile weight must be finite.');
    finalView=view;
    smileWeight=THREE.MathUtils.clamp(weight,0,1);
    updateClosure();
  }
  function setState(state) {
    sceneProgress=state.sceneProgress??0;
    updateClosure();
    const dispersed = floatingAmount(sceneProgress);
    floating?.update(sceneProgress,closureCm);
    const crownMix=smooth(.80,.825,sceneProgress)*smileWeight;
    visibleCount=0;
    for (const [fdi,item] of teeth) {
      let reveal=0;
      if(fdi===config.anatomy.hero) reveal=1;
      else if(config.anatomy.neighbors.includes(fdi)) reveal=state.neighborsReveal;
      else if(item.upper===(config.anatomy.hero<30)) {
        reveal=state.lowerReveal;
      } else {
        reveal=state.upperReveal;
      }
      reveal=Math.max(reveal,dispersed);
      item.reveal=reveal;
      item.finish?.setReveal(reveal*(1-crownMix));
      if(item.crown) {
        // Keep the shared crown surface opaque while only the roots recede.
        // This avoids two translucent copies of the same enamel shimmering.
        const opacity=crownMix>.001?reveal:0;
        item.crownFinish.setReveal(opacity);
        item.crown.matrix.copy(item.mesh.matrix);
        item.crown.updateMatrixWorld(true);
      }
      if(item.mesh&&reveal>.00001)visibleCount++;
    }
  }
  function setProgress(p){setState(sampleDentalStory(p,sampled));}
  const selection=(filter)=>[...teeth.values()].filter(filter).map((i)=>i.entry.fdi===config.anatomy.hero?i.mesh:i.proxy);
  // Center the frontal lens on the native anterior crowns in their final
  // pose. A landscape sensor crops the photograph; all original surfaces
  // continue to render fully opaque and remain available in Anatomy.
  let smileBounds;
  function measureSmile() {
    if(smileBounds)return smileBounds;
    const crowns=new THREE.Box3(),p=new THREE.Vector3();
    for(const item of teeth.values()) {
      if(!item.mesh||item.entry.fdi%10>3)continue;
      const cervicalHeight=item.entry.cervicalRing.reduce((sum,point)=>sum+point[1],0)/item.entry.cervicalRing.length;
      const positions=item.mesh.geometry.attributes.position;
      const matrix=item.mesh.matrix.clone();
      matrix.elements[13]=item.matrix.elements[13]-(item.upper?config.anatomy.smileClosureCm:0);
      for(let i=0;i<positions.count;i++) {
        if(positions.getY(i)<cervicalHeight)continue;
        crowns.expandByPoint(p.fromBufferAttribute(positions,i).applyMatrix4(matrix));
      }
    }
    if(crowns.isEmpty())throw new Error('The smile composition needs the anterior crown meshes.');
    const center=crowns.getCenter(new THREE.Vector3());
    center.y+=0.04; // Bias the composition toward the maxillary incisors.
    // This focus region also keeps the two central pairs within the field
    // when the user inspects the final scene on a very narrow canvas.
    const halfExtent=new THREE.Vector3(0.89,0.37,0.015);
    smileBounds=new THREE.Box3(center.clone().sub(halfExtent),center.clone().add(halfExtent));
    return smileBounds;
  }
  const landmarks={
    hero:()=>teeth.get(config.anatomy.hero).mesh,
    neighbors:()=>selection((i)=>config.anatomy.neighbors.includes(i.entry.fdi)),
    arch:()=>selection((i)=>i.upper===(config.anatomy.hero<30)),
    full:()=>selection(()=>true),
    smile:measureSmile,
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
  return { object,teeth,landmarks,attachAtlas,attachCrowns,setState,setProgress,setFinalView,report,dispose,ownsSource(source){return sourceObjects.has(source?.object);},get finalView(){return finalView;},get closureCm(){return closureCm;},get assetsReady(){return assetsReady;},get visibleCount(){return visibleCount;} };
}
