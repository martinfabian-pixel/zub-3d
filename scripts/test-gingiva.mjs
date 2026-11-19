import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Float32BufferAttribute, Matrix4, Ray, Triangle, Vector3 } from 'three';
import { createGingiva } from '../src/experience/gingiva.js';
import { sampleDentalStory } from '../src/experience/dental-story.js';

const read = name => JSON.parse(readFileSync(new URL('../public/'+name, import.meta.url)));
const { teeth:entries } = read('dentition-assets/manifest.json');
const { brush } = read('story-assets/site.json');
function teachingPositions(suffix) {
  const result=new Map();
  for(const [base,targets] of [['dentition',[35,37]],['hero-36',[36]]]){
    const bytes=readFileSync(new URL('../public/dentition-assets/'+base+suffix+'.glb',import.meta.url));
    const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+size));
    for(const fdi of targets) {
      const name=base==='hero-36'?'ToothExterior':'FDI_'+fdi;
      const prim=doc.meshes.find(mesh=>mesh.name===name).primitives[0];
      const acc=doc.accessors[prim.attributes.POSITION],view=doc.bufferViews[acc.bufferView];
      assert.equal(acc.componentType,5126);assert.equal(acc.type,'VEC3');
      assert.ok(!view.byteStride||view.byteStride===12);
      const start=bytes.byteOffset+28+size+(view.byteOffset??0)+(acc.byteOffset??0);
      const values=new Float32Array(bytes.buffer,start,acc.count*3);
      result.set(fdi,new Float32BufferAttribute(values,3));
    }
  }
  return result;
}
const triangle=new Triangle(),nearest=new Vector3();
function eachFace(mesh,materialIndex,examine) {
  const geometry=mesh.geometry,indices=geometry.index.array;
  for(const group of geometry.groups) {
    if(materialIndex!==null&&group.materialIndex!==materialIndex)continue;
    for(let f=group.start;f<group.start+group.count;f+=3){
      mesh.getVertexPosition(indices[f],triangle.a);
      mesh.getVertexPosition(indices[f+1],triangle.b);
      mesh.getVertexPosition(indices[f+2],triangle.c);
      if(triangle.getArea()>1e-10)examine(triangle);
    }
  }
}
function boneArea(site){
  let area=0;
  eachFace(site,1,tri=>area+=tri.getArea());
  return area;
}
for(const suffix of ['','-mobile']) {
  const teeth = new Map(), seats = new Map(),trim=new Map();
  const positions=teachingPositions(suffix);
  for(const entry of entries) {
    const matrix = new Matrix4().fromArray(entry.matrix);
    matrix.elements[13] += entry.fdi<30 ? .32 : -.48;
    const position=positions.get(entry.fdi);
    teeth.set(entry.fdi, {entry,matrix,seatedMatrix:matrix,mesh:position?{geometry:{attributes:{position}}}:null,
      finish:{setGumBase(value){trim.set(entry.fdi,value);}}});
    const crown = matrix.clone();
    if(entry.reflected)crown.multiply(new Matrix4().makeScale(-1,1,1));
    seats.set(entry.fdi,crown);
  }
  const tissue=createGingiva(teeth,seats);
  const site=tissue.object.getObjectByName('FDI 35–37 gingiva and alveolar window');
  tissue.update(sampleDentalStory(0),1,0);
  assert.ok(tissue.object.children.every(mesh=>mesh.visible),'Smile has both scalloped gum margins');
  assert.equal(boneArea(site),0,'No cut-bone triangles protrude through intact smile gingiva');
  tissue.update(sampleDentalStory(0),0,0);
  assert.ok(tissue.object.children.every(mesh=>!mesh.visible),'Atlas exposes roots for direct selection');
  assert.ok([...trim.values()].every(value=>value===-1),'All 28 complete atlas roots are exposed');

  const windowState=sampleDentalStory(.386);
  tissue.update(windowState,0,0);
  const socketArea=boneArea(site);
  assert.ok(socketArea>1.2,'Window has a physical bone floor, side walls and section face');
  const snapshot=[...site.morphTargetInfluences];
  assert.ok(tissue.object.children.filter(m=>m.visible).length===1,'Distant tissue recedes with the arch');

  const stations=brush.centerline.map(p=>new Vector3().fromArray(p.position));
  const step=Math.max(...stations.slice(1).map((p,i)=>p.distanceTo(stations[i])));
  tissue.update(sampleDentalStory(.846),0,0);
  assert.equal(boneArea(site),0,'The root window closes by the brush phase');
  for(const fdi of [35,36,37])assert.ok(trim.get(fdi)<teeth.get(fdi).entry.bounds[1],'The complete teaching root is preserved');
  let gap=Infinity;
  eachFace(site,null,tri=>{
    for(const p of stations)gap=Math.min(gap,tri.closestPointToPoint(p,nearest).distanceTo(p));
  });
  // Distance to a surface is 1-Lipschitz. Half a station interval bounds the
  // unsampled minimum along each straight segment of the measured polyline.
  const guaranteedMm=(gap-step/2)*10;
  assert.ok(guaranteedMm>brush.dimensionsMm.bristleRadius,
    'The complete bristle envelope must clear gum and bone on both sides: '+guaranteedMm+' mm');

  tissue.update(windowState,0,0);
  assert.deepEqual(site.morphTargetInfluences,snapshot);
  assert.equal(boneArea(site),socketArea,'Reverse seek reconstructs the identical socket');
  const target=new Vector3(),normal=new Vector3(),ray=new Ray();
  let checked=false;
  eachFace(site,1,tri=>{
    if(checked||tri.getArea()<.0001)return;
    tri.getNormal(normal); tri.getMidpoint(target);
    ray.origin.copy(target).addScaledVector(normal,.0002);ray.direction.copy(normal).negate();
    assert.ok(tissue.occludes(ray,0,.00035),'A rendered bone face occludes an annotation behind it');
    assert.ok(!tissue.occludes(ray,0,.00005),'A label in front of the bone remains selectable');
    checked=true;
  });
  assert.ok(checked);
  console.log((suffix?'Mobile':'Desktop')+' gingiva and socket passed. Minimum continuous teaching-path clearance ≥ '+guaranteedMm.toFixed(2)+' mm.');
}
