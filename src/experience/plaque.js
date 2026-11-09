import { BufferGeometry, Color, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector2, Vector3, Vector4 } from 'three';
import { MM_TO_WORLD as mm, saturate } from './cleaning-path.js';

// Thin surface-bound disclosed biofilm, not a volume around the contact. The
// nonclinical contrast tint is intentionally independent of enamel and caries.
const fragmentDeclarations=`
uniform float deposit,cleaned,lesionAmount,hostMorph;
uniform vec3 plaqueTint,plaqueWarm,spineOrigin,spineDirection;
uniform vec2 spineSize;
uniform vec4 sweepDomain;
varying vec4 vFilm;
varying vec3 vBoundary;
varying vec3 vSurfaceWorld,vRestWorld;
float filmHash(vec3 v){
  v=fract(v*.1031); v+=dot(v,v.yzx+33.33); return fract((v.x+v.y)*v.z);
}
float filmNoise(vec3 p){
  vec3 i=floor(p),w=fract(p); w=w*w*(3.-2.*w);
  float a=mix(filmHash(i),filmHash(i+vec3(1,0,0)),w.x);
  float b=mix(filmHash(i+vec3(0,1,0)),filmHash(i+vec3(1,1,0)),w.x);
  float c=mix(filmHash(i+vec3(0,0,1)),filmHash(i+vec3(1,0,1)),w.x);
  float d=mix(filmHash(i+vec3(0,1,1)),filmHash(i+vec3(1,1,1)),w.x);
  return mix(mix(a,b,w.y),mix(c,d,w.y),w.z);
}
`;
function makeFilmMaterial(uniforms) {
  const material=new MeshStandardMaterial({name:'Disclosed adherent biofilm',color:0xffffff,roughness:.81,metalness:0,
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec4 filmSweep; attribute vec3 filmBoundary; attribute vec3 surfaceWorld,filmSurfaceDelta;
      uniform float hostMorph; varying vec4 vFilm; varying vec3 vBoundary; varying vec3 vSurfaceWorld,vRestWorld;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vFilm=filmSweep; vBoundary=filmBoundary; vRestWorld=surfaceWorld;
        vSurfaceWorld=surfaceWorld+hostMorph*filmSurfaceDelta;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+fragmentDeclarations)
      .replace('#include <color_fragment>',`#include <color_fragment>
        // A gently broken sheet follows the native contact and cervical side.
        // Rest coordinates keep its pattern attached while the surface morphs.
        float coarse=filmNoise(vRestWorld*18.0);
        float fine=filmNoise(vRestWorld*59.0);
        float fleck=.68*coarse+.32*fine;
        float edge=smoothstep(0.,.14,vBoundary.x)*smoothstep(.06,.55,vBoundary.x+.52*(fleck-.5));
        float density=vBoundary.z*(.34+.66*smoothstep(.18,.69,fleck));
        float formed=smoothstep(0.,.48+.39*coarse,deposit)*smoothstep(0.,1.,deposit);
        float axial=dot(vSurfaceWorld-spineOrigin,spineDirection);
        float station=clamp(axial,0.,spineSize.x);
        float radial=length(vSurfaceWorld-(spineOrigin+station*spineDirection));
        // Per-fragment hard support: interpolating vertex reach alone could
        // clean over the edge of the physical swept cylinder on a large face.
        float within=1.-smoothstep(spineSize.y*.94,spineSize.y,radial);
        float pastTip=mix(sweepDomain.x,sweepDomain.y,cleaned)-axial;
        float insideSweep=step(sweepDomain.z,axial)*smoothstep(0.,sweepDomain.w,pastTip);
        float wiped=within*insideSweep*smoothstep(vFilm.x,vFilm.y,cleaned);
        float exclude=vBoundary.y*lesionAmount;
        diffuseColor.rgb=mix(plaqueTint,plaqueWarm,.23+.51*coarse)*(.97+.07*fine);
        diffuseColor.a*=density*edge*formed*(1.-wiped)*(1.-exclude)*.79;
        if(diffuseColor.a<.003)discard;`);
  };
  material.customProgramCacheKey=()=>'adherent-surface-film-r186-v2';
  return material;
}
function validPatch(raw) {
  const n=raw.positions?.length/3;
  if(!Number.isInteger(n)||n<3||raw.normals?.length!==3*n||!raw.indices?.length||
    raw.indices.length%3!==0||raw.indices.some(i=>!Number.isInteger(i)||i<0||i>=n)||
    raw.sourceVertexIndices?.length!==n||raw.edgeWeight?.length!==n||raw.pathDistanceMm?.length!==n||raw.nearestArcMm?.length!==n||
    (raw.depositionWeight&&raw.depositionWeight.length!==n))
    throw new Error('Invalid source-surface plaque patch for FDI '+raw.fdi);
  return n;
}
function agreesWithMesh(patch,mesh) {
  if(!mesh||!patch.sourceVertexIndices)return false;
  const source=mesh.geometry?.getAttribute('position');
  if(!source)return false;
  for(let i=0;i<patch.sourceVertexIndices.length;i++) {
    const j=patch.sourceVertexIndices[i],k=i*3;
    if(j>=source.count||Math.abs(source.getX(j)-patch.positions[k])>1e-6||
      Math.abs(source.getY(j)-patch.positions[k+1])>1e-6||Math.abs(source.getZ(j)-patch.positions[k+2])>1e-6)return false;
  }
  return true;
}

function conformToRefinedFaces(raw, geometry, world, path) {
  const recipe=geometry?.userData.lesionRefinement;
  if(!recipe)return raw;
  const original=geometry.userData.lesionSourceIndex;
  const faceKey=(a,b,c)=>[a,b,c].sort((i,j)=>i-j).join('/');
  const replaced=new Map();
  for(const f of recipe.replacedFaces) {
    replaced.set(faceKey(original.getX(3*f),original.getX(3*f+1),original.getX(3*f+2)),f);
  }
  const children=new Map();
  for(let i=0;i<recipe.parentFaces.length;i++) {
    const parent=recipe.parentFaces[i];
    if(!children.has(parent))children.set(parent,[]);
    children.get(parent).push(recipe.triangles[3*i],recipe.triangles[3*i+1],recipe.triangles[3*i+2]);
  }
  const out={...raw,indices:[]};
  const scalarFields=['edgeWeight','lesionExclusion'];
  if(raw.depositionWeight)scalarFields.push('depositionWeight');
  for(const k of ['sourceVertexIndices','positions','normals','pathDistanceMm','nearestArcMm',...scalarFields])out[k]=raw[k].slice();
  const local=new Map(out.sourceVertexIndices.map((global,i)=>[global,i]));
  const point=new Vector3(),near={};
  function vertex(global) {
    if(local.has(global))return local.get(global);
    const edge=2*(global-recipe.sourceVertexCount);
    if(edge<0 || edge+1>=recipe.edgeMidpoints.length)throw new Error('Unregistered refined film edge.');
    const a=vertex(recipe.edgeMidpoints[edge]),b=vertex(recipe.edgeMidpoints[edge+1]);
    const index=out.sourceVertexIndices.length;
    point.fromBufferAttribute(geometry.attributes.position,global);
    out.positions.push(point.x,point.y,point.z);path.nearest(point.applyMatrix4(world),near);
    out.pathDistanceMm.push(near.distanceMm);out.nearestArcMm.push(near.arcMm);
    point.fromBufferAttribute(geometry.attributes.normal,global);out.normals.push(point.x,point.y,point.z);
    for(const k of scalarFields)out[k].push((out[k][a]+out[k][b])*.5);
    out.sourceVertexIndices.push(global);local.set(global,index);return index;
  }
  for(let i=0;i<raw.indices.length;i+=3) {
    const a=raw.indices[i],b=raw.indices[i+1],c=raw.indices[i+2];
    const parent=replaced.get(faceKey(raw.sourceVertexIndices[a],raw.sourceVertexIndices[b],raw.sourceVertexIndices[c]));
    if(parent===undefined)out.indices.push(a,b,c);
    else for(const index of children.get(parent))out.indices.push(vertex(index));
  }
  return out;
}

export function createPlaque({site,path,arch,compact=false,profile,options={}}) {
  const rawPatches=site?.plaque?.patches;
  if(!Array.isArray(rawPatches)||!rawPatches.length)throw new Error('Measured plaque surface patches are missing.');
  const object=new Group();object.name='36–37 · attached interdental biofilm';object.userData.kind='plaque';
  const peripheral=.14;
  const contact=new Vector3().fromArray(site.tightestGapFocusWorldCm);
  const occlusal=new Vector3().fromArray(site.basisWorld.occlusal),buccal=new Vector3().fromArray(site.basisWorld.buccal);
  const relative=new Vector3();
  // Below the proximal contact, the film gathers along the cervical side
  // of the surface patch. Neither the brush axis nor its radius is sampled.
  function densityAtSurface(world) {
    relative.copy(world).sub(contact).divideScalar(mm);
    const height=relative.dot(occlusal),lateral=relative.dot(buccal);
    const t=saturate((-height-1.08-.14*lateral)/1.13);
    return peripheral+(1-peripheral)*t*t*(3-2*t);
  }
  const uniforms={
    deposit:{value:0},cleaned:{value:0},lesionAmount:{value:0},hostMorph:{value:0},
    plaqueTint:{value:new Color(options.tint??'#aba99b')},plaqueWarm:{value:new Color(options.warmTint??'#c5bea3')},
    spineOrigin:{value:path.startWorld},spineDirection:{value:path.directionWorld},
    spineSize:{value:new Vector2(path.totalMm*mm,path.dimensions.bristleRadiusMm*mm)},
    sweepDomain:{value:new Vector4(
      (path.tipArcMm(.1)-path.firstArcMm-path.dimensions.tipMarginMm)*mm,
      (path.tipArcMm(1)-path.firstArcMm-path.dimensions.tipMarginMm)*mm,
      (path.tipArcMm(0)-path.firstArcMm-path.dimensions.tipMarginMm-path.dimensions.bristledLengthMm)*mm,.06*mm)},
  };
  const material=makeFilmMaterial(uniforms),patches=[],threshold={},near={};
  const liftBindings=[];
  let disposed=false;
  try {
    for(const base of rawPatches) {
      const fdi=Number(base.fdi),item=arch?.teeth?.get(fdi),mesh=item?.mesh;
      let raw=base;
      if(fdi===37 && site.plaque.mobile37 && (mesh
        ? !agreesWithMesh(base,mesh)&&agreesWithMesh(site.plaque.mobile37,mesh)
        : profile?.compact??compact))raw=site.plaque.mobile37;
      validPatch(raw);
      if(mesh&&!agreesWithMesh(raw,mesh))throw new Error('Plaque patch does not match its host mesh vertices: FDI '+fdi);
      const registration=site.displayedMatrixColumnMajor?.[String(fdi)];
      if(!mesh&&!item?.matrix&&!registration)throw new Error('Plaque patch has no registered tooth transform: '+fdi);
      mesh?.updateWorldMatrix(true,false,true);
      const world=mesh?.matrixWorld?.clone()??item?.matrix?.clone()??new Matrix4().fromArray(registration);
      raw=conformToRefinedFaces(raw,mesh?.geometry,world,path);
      const n=raw.sourceVertexIndices.length;
      const inverse=world.clone().invert(),normalMatrix=new Matrix3().getNormalMatrix(world);
      const pos=new Float32Array(3*n),surface=new Float32Array(3*n),sweep=new Float32Array(4*n),edge=new Float32Array(3*n);
      const surfaceDelta=new Float32Array(3*n);
      const hostPosition=mesh?.geometry.morphAttributes.position?.[0],hostNormal=mesh?.geometry.morphAttributes.normal?.[0];
      const filmPositionDelta=hostPosition?new Float32Array(3*n):null,filmNormalDelta=hostNormal?new Float32Array(3*n):null;
      const p=new Vector3(),normal=new Vector3(),mature=new Vector3(),matureNormal=new Vector3(),matureLocal=new Vector3(),temp=new Vector3();
      const changingNormals=[];
      let reachable=0,unreachable=0,reachableWeight=0,outsideWeight=0,maxRegistrationErrorMm=0;
      for(let i=0;i<n;i++){
        const k=3*i,e=saturate(raw.edgeWeight[i]),ex=saturate(raw.lesionExclusion?.[i]??0);
        p.fromArray(raw.positions,k).applyMatrix4(world);p.toArray(surface,k);
        path.nearest(p,near);
        maxRegistrationErrorMm=Math.max(maxRegistrationErrorMm,Math.abs(near.distanceMm-raw.pathDistanceMm[i]));
        path.sweepThreshold(raw.pathDistanceMm[i],raw.nearestArcMm[i],threshold);
        // A less dense extension can share the same physical support and
        // lift. This weighting is identical before and after every pass.
        const depositionScale=raw.depositionWeight&&e>0?saturate(raw.depositionWeight[i]/e):1;
        // This teaching example deliberately discloses the deposit on the
        // contact surfaces reached by the bristles. The original patch still
        // extends beyond the sweep, but its far edge is barely disclosed: we
        // never claim that an unreachable surface was scrubbed clean.
        // Smooth this fixed initial distribution, not the cleaning progress,
        // so reverse scroll cannot make residue vanish or repaint it later.
        const emphasis=.004+.996*threshold.reach*threshold.reach;
        const density=densityAtSurface(p)*depositionScale*emphasis;
        sweep.set([threshold.start,threshold.end,threshold.reach,raw.pathDistanceMm[i]],4*i);edge.set([e,ex,density],3*i);
        if(e>.001) {
          const r=path.removedFraction(1,threshold);
          if(r>0){reachable++;reachableWeight+=e*density*r;}else {unreachable++;outsideWeight+=e*density;}
        }
        // Deposit follows the correctly transformed source normal, in physical
        // units despite the authored object's local-metre-to-world-cm scaling.
        normal.fromArray(raw.normals,k).applyMatrix3(normalMatrix).normalize();
        const variation=.5+.5*Math.sin(17*p.x+29*p.y-43*p.z);
        const filmMm=.020+.016*e*variation;
        p.addScaledVector(normal,filmMm*mm).applyMatrix4(inverse).toArray(pos,k);
        if(hostPosition) {
          const sourceIndex=raw.sourceVertexIndices[i];
          mature.fromBufferAttribute(hostPosition,sourceIndex);
          if(mesh.geometry.morphTargetsRelative)mature.add(temp.fromArray(raw.positions,k));
          matureLocal.copy(mature);
          mature.applyMatrix4(world);
          temp.fromArray(surface,k).sub(mature).negate().toArray(surfaceDelta,k);
          matureNormal.fromArray(raw.normals,k);
          if(hostNormal) {
            temp.fromBufferAttribute(hostNormal,sourceIndex);
            if(mesh.geometry.morphTargetsRelative)matureNormal.add(temp);else matureNormal.copy(temp);
            matureNormal.normalize();
            temp.fromArray(raw.normals,k).sub(matureNormal).negate().toArray(filmNormalDelta,k);
          }
          matureNormal.applyMatrix3(normalMatrix).normalize();
          mature.addScaledVector(matureNormal,filmMm*mm).applyMatrix4(inverse);
          const cosine=normal.dot(matureNormal);
          if(cosine<.99999) {
            const lift0=p.clone().sub(temp.fromArray(raw.positions,k));
            const delta=mature.clone().sub(matureLocal).sub(lift0);
            changingNormals.push({i,k,cosine,lift0,delta});
          }
          mature.sub(p).toArray(filmPositionDelta,k);
        }
      }
      if(maxRegistrationErrorMm>.04)throw new Error('Plaque surface/path registration differs by more than 0.04 mm: FDI '+fdi);
      const g=new BufferGeometry();
      g.setAttribute('position',new Float32BufferAttribute(pos,3));
      if(changingNormals.length)liftBindings.push({attribute:g.attributes.position,rest:pos,changingNormals,last:0});
      g.setAttribute('normal',new Float32BufferAttribute(raw.normals,3));
      g.setAttribute('filmSweep',new Float32BufferAttribute(sweep,4));
      g.setAttribute('filmBoundary',new Float32BufferAttribute(edge,3));
      g.setAttribute('filmSurfaceDelta',new Float32BufferAttribute(surfaceDelta,3));
      g.setAttribute('surfaceWorld',new Float32BufferAttribute(surface,3));g.setIndex(raw.indices);
      if(filmPositionDelta) {
        g.morphTargetsRelative=true;g.morphAttributes.position=[new Float32BufferAttribute(filmPositionDelta,3)];
        if(filmNormalDelta)g.morphAttributes.normal=[new Float32BufferAttribute(filmNormalDelta,3)];
      }
      g.computeBoundingSphere();
      const layer=new Mesh(g,material);
      if(filmPositionDelta)layer.morphTargetInfluences=mesh.morphTargetInfluences;
      layer.name='FDI '+fdi+' · disclosed surface deposit';layer.userData.kind='plaque';layer.userData.hostFDI=fdi;
      if(options.retainSourceIndices)layer.userData.hostVertexIndices=raw.sourceVertexIndices;
      layer.matrixAutoUpdate=false;layer.matrix.copy(world);layer.matrixWorldNeedsUpdate=true;layer.renderOrder=4;
      layer.receiveShadow=true;layer.castShadow=false;object.add(layer);
      patches.push({fdi,geometry:g,sweep,edge,reachable,unreachable,reachableWeight,outsideWeight,maxRegistrationErrorMm,vertices:n,triangles:raw.indices.length/3});
    }
  } catch(error){for(const patch of patches)patch.geometry.dispose();material.dispose();throw error;}
  object.visible=false;
  function setState({visible=true,opacity=1,progress=0,lesionProgress=0}={}) {
    if(disposed)return;
    uniforms.deposit.value=saturate(opacity);
    uniforms.cleaned.value=saturate(progress);
    uniforms.lesionAmount.value=saturate(lesionProgress);
    uniforms.hostMorph.value=arch?.teeth.get(36)?.mesh?.morphTargetInfluences?.[0]??0;
    // Linear interpolation of two unit normal offsets would briefly pull
    // a coating toward a turning cavity wall. Restore the physical offset
    // length only on the affected vertices, only when the host morph changes.
    const t=uniforms.hostMorph.value;
    for(const binding of liftBindings) {
      if(binding.last===t)continue;
      for(const {i,k,cosine,lift0,delta} of binding.changingNormals) {
        const factor=1/Math.sqrt(Math.max(1e-8,1-2*t*(1-t)*(1-cosine)))-1;
        binding.attribute.setXYZ(i,binding.rest[k]+factor*(lift0.x+t*delta.x),
          binding.rest[k+1]+factor*(lift0.y+t*delta.y),binding.rest[k+2]+factor*(lift0.z+t*delta.z));
      }
      binding.attribute.needsUpdate=true;binding.last=t;
    }
    object.visible=Boolean(visible)&&uniforms.deposit.value>.0001;
  }
  function report() {
    const cleaned=uniforms.cleaned.value,lesion=uniforms.lesionAmount.value;
    return {visible:object.visible,deposition:uniforms.deposit.value,cleaningProgress:cleaned,lesionProgress:lesion,
      maxFilmThicknessMm:.036,initialDensityProfile:{basis:'contact-side disclosure with faint unreachable residue',peripheral},disposed,patches:patches.map(d=>{
        let totalWeight=0,removedWeight=0,outsideRemoved=0;
        for(let i=0;i<d.vertices;i++){
          threshold.start=d.sweep[4*i];threshold.end=d.sweep[4*i+1];threshold.reach=d.sweep[4*i+2];
          const weight=d.edge[3*i]*d.edge[3*i+2]*(1-d.edge[3*i+1]*lesion);
          const fraction=path.removedFraction(cleaned,threshold);totalWeight+=weight;removedWeight+=weight*fraction;
          if(d.sweep[4*i+3]>=path.dimensions.bristleRadiusMm)outsideRemoved+=weight*fraction;
        }
        return {fdi:d.fdi,vertices:d.vertices,triangles:d.triangles,reachableVertices:d.reachable,unreachableVertices:d.unreachable,
          potentialReachWeight:d.reachableWeight,outsideWeight:d.outsideWeight,maxRegistrationErrorMm:d.maxRegistrationErrorMm,
          // A reproducible vertex-weight diagnostic, not a clinical percentage.
          currentWeightedRemoval:totalWeight?removedWeight/totalWeight:0,outsideRemovedWeight:outsideRemoved};
      })};
  }
  function dispose(){if(disposed)return;disposed=true;object.removeFromParent();for(const p of patches)p.geometry.dispose();material.dispose();object.clear();patches.length=0;liftBindings.length=0;}
  return {object,setState,report,dispose};
}
