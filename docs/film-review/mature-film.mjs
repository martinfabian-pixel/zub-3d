// CPU fixture for the independent Blender contact audit. It returns snapshots
// of the triangles actually rendered by createCaries + createPlaque at 100%.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createCaries } from '../../src/experience/caries.js';
import { createPlaque } from '../../src/experience/plaque.js';
import { experienceConfig } from '../../src/experience/config.js';

async function readGeometry(file, name) {
  const bytes = await readFile(file), size = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString('utf8',20,20+size));
  const part = doc.meshes.find(m => m.name === name).primitives[0];
  function attribute(id) {
    const a = doc.accessors[id], view = doc.bufferViews[a.bufferView];
    const Type = { 5123:Uint16Array, 5125:Uint32Array, 5126:Float32Array }[a.componentType];
    const width = { SCALAR:1, VEC3:3 }[a.type], step = Type.BYTES_PER_ELEMENT;
    const data = new Type(a.count*width), start = 28+size+(a.byteOffset??0)+(view.byteOffset??0);
    for(let i=0;i<a.count;i++)for(let j=0;j<width;j++){
      const offset = start+i*(view.byteStride??step*width)+j*step;
      data[i*width+j] = a.componentType===5126?bytes.readFloatLE(offset):step===2?bytes.readUInt16LE(offset):bytes.readUInt32LE(offset);
    }
    return new BufferAttribute(data,width);
  }
  return new BufferGeometry().setAttribute('position',attribute(part.attributes.POSITION))
    .setAttribute('normal',attribute(part.attributes.NORMAL)).setIndex(attribute(part.indices));
}

const faceKey = (a,b,c) => [a,b,c].sort((x,y)=>x-y).join('/');

export async function createMatureFilm({ root, site, path: guide, compact }) {
  const suffix = compact ? '-mobile' : '';
  const hosts = { teeth:new Map(), object:new Group() }, basic = new MeshBasicMaterial();
  for(const fdi of [36,37]){
    const hero = fdi===36, file = (hero?'hero-36':'dentition')+suffix+'.glb';
    const geometry = await readGeometry(path.join(root,'public/dentition-assets',file),hero?'ToothExterior':'FDI_37');
    const mesh = new Mesh(geometry,basic);mesh.matrixAutoUpdate=false;
    mesh.matrix.fromArray(site.displayedMatrixColumnMajor[fdi]);hosts.object.add(mesh);hosts.teeth.set(fdi,{mesh});
  }
  hosts.object.updateMatrixWorld(true);
  const data=JSON.parse(await readFile(path.join(root,'public/story-assets/caries-36.json')));
  const caries=createCaries({arch:hosts,data,config:experienceConfig,clay:true});
  const film=createPlaque({site,path:guide,arch:hosts,compact,options:{retainSourceIndices:true}});
  const object=new Group(), geometrySnapshots=[], a=new Vector3(), b=new Vector3();
  film.object.updateMatrixWorld(true);
  const patches=[];
  for(const layer of film.object.children){
    const fdi=layer.userData.hostFDI, host=hosts.teeth.get(fdi).mesh;
    const source=layer.userData.hostVertexIndices, index=layer.geometry.index, hostFaces=new Set();
    for(let i=0;i<host.geometry.index.count;i+=3){
      const f=host.geometry.index;hostFaces.add(faceKey(f.getX(i),f.getX(i+1),f.getX(i+2)));
    }
    for(let i=0;i<index.count;i+=3){
      assert.ok(hostFaces.has(faceKey(source[index.getX(i)],source[index.getX(i+1)],source[index.getX(i+2)])),
        'Coating triangle is not the corresponding refined host triangle on '+fdi);
    }
    let minimumLiftMm=Infinity,maximumLiftMm=0;
    for(const t of [0,.35,.5,.7,1]){
      caries.setProgress(t);film.setState({opacity:1,progress:0,lesionProgress:t});
      for(let i=0;i<source.length;i++){
        layer.getVertexPosition(i,a).applyMatrix4(layer.matrixWorld);
        host.getVertexPosition(source[i],b).applyMatrix4(host.matrixWorld);
        const lift=a.distanceTo(b)*10;minimumLiftMm=Math.min(minimumLiftMm,lift);maximumLiftMm=Math.max(maximumLiftMm,lift);
      }
    }
    assert.ok(minimumLiftMm>=.019 && maximumLiftMm<=.0361,`Unattached film on ${fdi}: ${minimumLiftMm}..${maximumLiftMm} mm`);
    const g=new BufferGeometry(),positions=new Float32Array(source.length*3);
    for(let i=0;i<source.length;i++)layer.getVertexPosition(i,a).toArray(positions,3*i);
    g.setAttribute('position',new BufferAttribute(positions,3)).setIndex(index.clone());geometrySnapshots.push(g);
    const snapshot=new Mesh(g,basic);snapshot.userData.hostFDI=fdi;snapshot.matrixAutoUpdate=false;
    snapshot.matrix.copy(layer.matrixWorld);object.add(snapshot);
    patches.push({fdi,registeredVertices:source.length,matchedHostTriangles:index.count/3,minimumLiftMm,maximumLiftMm});
  }
  object.updateMatrixWorld(true);
  const report={maturity:1,lesionProgressSamples:[0,.35,.5,.7,1],patches};
  film.dispose();caries.dispose();for(const {mesh} of hosts.teeth.values())mesh.geometry.dispose();
  return {object,report:()=>report,dispose(){for(const g of geometrySnapshots)g.dispose();basic.dispose();object.clear();}};
}
