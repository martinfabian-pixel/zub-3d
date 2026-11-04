import * as THREE from 'three';
import { prepareJourneyMaterial } from './materials.js';
import { disposeObject } from './scene.js';
import { sampleDentalStory } from './dental-story.js';

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

/** Fixed, author-derived anatomical placement. Only the reveal uniform changes. */
export function createArch({ manifest, hero, config, renderer, profile, clay=false }) {
  const object = new THREE.Group(); object.name='28 permanent teeth — author-arranged dentition';
  const teeth = new Map(), mirror = new THREE.Matrix4().makeScale(-1,1,1);
  const mirrored = new Map();
  // The live teeth borrow GLTF geometries and texture images. Take ownership
  // before attaching, including partial failures, and release the union once.
  const sourceObjects=new Set([hero.object]);
  const proxies = [];
  let disposed=false, assetsReady=false, visibleCount=1;
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
  }
  const sampled={brushPose:{}};
  function setState(state) {
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
      item.reveal=reveal;
      item.finish?.setReveal(reveal);
      if(item.mesh&&reveal>.00001)visibleCount++;
    }
  }
  function setProgress(p){setState(sampleDentalStory(p,sampled));}
  const selection=(filter)=>[...teeth.values()].filter(filter).map((i)=>i.entry.fdi===config.anatomy.hero?i.mesh:i.proxy);
  const landmarks={
    hero:()=>teeth.get(config.anatomy.hero).mesh,
    neighbors:()=>selection((i)=>config.anatomy.neighbors.includes(i.entry.fdi)),
    arch:()=>selection((i)=>i.upper===(config.anatomy.hero<30)),
    full:()=>selection(()=>true),
  };
  function report() {
    return [...teeth].map(([fdi,item])=>({fdi,source:item.entry.source,loaded:Boolean(item.mesh),reveal:item.mesh?item.reveal:0,worldMatrix:(item.mesh?.matrixWorld??item.matrix).toArray(),triangles:item.mesh?(item.mesh.geometry.index?.count??item.mesh.geometry.attributes.position.count)/3:0}));
  }
  function dispose() {
    if(disposed)return; disposed=true;
    for(const item of teeth.values())item.finish?.dispose();
    const owned=new THREE.Group();owned.add(object,...sourceObjects);
    disposeObject(owned);sourceObjects.clear();
    for(const proxy of proxies) {proxy.geometry.dispose();proxy.material.dispose();}
    mirrored.clear(); teeth.clear();
  }
  return { object,teeth,landmarks,attachAtlas,setState,setProgress,report,dispose,ownsSource(source){return sourceObjects.has(source?.object);},get assetsReady(){return assetsReady;},get visibleCount(){return visibleCount;} };
}
