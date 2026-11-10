import { BufferGeometry, Color, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector2, Vector3, Vector4 } from 'three';
import { MM_TO_WORLD as mm, saturate } from './cleaning-path.js';

// Thin surface-bound disclosed biofilm, not a volume around the contact. The
// nonclinical contrast tint is independent of the underlying enamel.
const fragmentDeclarations=`
uniform float deposit,cleaned;
uniform vec3 plaqueTint,plaqueWarm,spineOrigin,spineDirection;
uniform vec2 spineSize;
uniform vec4 sweepDomain;
varying vec4 vFilm;
varying vec2 vBoundary;
varying vec3 vSurfaceWorld;
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
      attribute vec4 filmSweep; attribute vec2 filmBoundary; attribute vec3 surfaceWorld;
      varying vec4 vFilm; varying vec2 vBoundary; varying vec3 vSurfaceWorld;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vFilm=filmSweep; vBoundary=filmBoundary; vSurfaceWorld=surfaceWorld;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+fragmentDeclarations)
      .replace('#include <color_fragment>',`#include <color_fragment>
        // A gently broken sheet follows the native contact and cervical side.
        float coarse=filmNoise(vSurfaceWorld*18.0);
        float fine=filmNoise(vSurfaceWorld*59.0);
        float fleck=.68*coarse+.32*fine;
        float edge=smoothstep(0.,.14,vBoundary.x)*smoothstep(.06,.55,vBoundary.x+.52*(fleck-.5));
        float density=vBoundary.y*(.34+.66*smoothstep(.18,.69,fleck));
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
        diffuseColor.rgb=mix(plaqueTint,plaqueWarm,.23+.51*coarse)*(.97+.07*fine);
        diffuseColor.a*=density*edge*formed*(1.-wiped)*.79;
        if(diffuseColor.a<.003)discard;`);
  };
  material.customProgramCacheKey=()=>'adherent-surface-film-r186-v3';
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
    deposit:{value:0},cleaned:{value:0},
    plaqueTint:{value:new Color(options.tint??'#aba99b')},plaqueWarm:{value:new Color(options.warmTint??'#c5bea3')},
    spineOrigin:{value:path.startWorld},spineDirection:{value:path.directionWorld},
    spineSize:{value:new Vector2(path.totalMm*mm,path.dimensions.bristleRadiusMm*mm)},
    sweepDomain:{value:new Vector4(
      (path.tipArcMm(.1)-path.firstArcMm-path.dimensions.tipMarginMm)*mm,
      (path.tipArcMm(1)-path.firstArcMm-path.dimensions.tipMarginMm)*mm,
      (path.tipArcMm(0)-path.firstArcMm-path.dimensions.tipMarginMm-path.dimensions.bristledLengthMm)*mm,.06*mm)},
  };
  const material=makeFilmMaterial(uniforms),patches=[],threshold={},near={};
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
      const world=mesh&&item.seatedMatrix?new Matrix4().multiplyMatrices(mesh.parent.matrixWorld,item.seatedMatrix)
        :mesh?.matrixWorld?.clone()??item?.matrix?.clone()??new Matrix4().fromArray(registration);
      const n=raw.sourceVertexIndices.length;
      const inverse=world.clone().invert(),normalMatrix=new Matrix3().getNormalMatrix(world);
      const pos=new Float32Array(3*n),surface=new Float32Array(3*n),sweep=new Float32Array(4*n),edge=new Float32Array(2*n);
      const p=new Vector3(),normal=new Vector3();
      let reachable=0,unreachable=0,reachableWeight=0,outsideWeight=0,maxRegistrationErrorMm=0;
      for(let i=0;i<n;i++){
        const k=3*i,e=saturate(raw.edgeWeight[i]);
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
        sweep.set([threshold.start,threshold.end,threshold.reach,raw.pathDistanceMm[i]],4*i);edge.set([e,density],2*i);
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
      }
      if(maxRegistrationErrorMm>.04)throw new Error('Plaque surface/path registration differs by more than 0.04 mm: FDI '+fdi);
      const g=new BufferGeometry();
      g.setAttribute('position',new Float32BufferAttribute(pos,3));
      g.setAttribute('normal',new Float32BufferAttribute(raw.normals,3));
      g.setAttribute('filmSweep',new Float32BufferAttribute(sweep,4));
      g.setAttribute('filmBoundary',new Float32BufferAttribute(edge,2));
      g.setAttribute('surfaceWorld',new Float32BufferAttribute(surface,3));g.setIndex(raw.indices);
      g.computeBoundingSphere();
      const layer=new Mesh(g,material);
      layer.name='FDI '+fdi+' · disclosed surface deposit';layer.userData.kind='plaque';layer.userData.hostFDI=fdi;
      if(options.retainSourceIndices)layer.userData.hostVertexIndices=raw.sourceVertexIndices;
      layer.matrixAutoUpdate=false;layer.matrix.copy(world);layer.matrixWorldNeedsUpdate=true;layer.renderOrder=4;
      layer.receiveShadow=true;layer.castShadow=false;object.add(layer);
      patches.push({fdi,geometry:g,sweep,edge,reachable,unreachable,reachableWeight,outsideWeight,maxRegistrationErrorMm,vertices:n,triangles:raw.indices.length/3});
    }
  } catch(error){for(const patch of patches)patch.geometry.dispose();material.dispose();throw error;}
  object.visible=false;
  function setState({visible=true,opacity=1,progress=0}={}) {
    if(disposed)return;
    uniforms.deposit.value=saturate(opacity);
    uniforms.cleaned.value=saturate(progress);
    object.visible=Boolean(visible)&&uniforms.deposit.value>.0001;
  }
  function report() {
    const cleaned=uniforms.cleaned.value;
    return {visible:object.visible,deposition:uniforms.deposit.value,cleaningProgress:cleaned,
      maxFilmThicknessMm:.036,initialDensityProfile:{basis:'contact-side disclosure with faint unreachable residue',peripheral},disposed,patches:patches.map(d=>{
        let totalWeight=0,removedWeight=0,outsideRemoved=0;
        for(let i=0;i<d.vertices;i++){
          threshold.start=d.sweep[4*i];threshold.end=d.sweep[4*i+1];threshold.reach=d.sweep[4*i+2];
          const weight=d.edge[2*i]*d.edge[2*i+1];
          const fraction=path.removedFraction(cleaned,threshold);totalWeight+=weight;removedWeight+=weight*fraction;
          if(d.sweep[4*i+3]>=path.dimensions.bristleRadiusMm)outsideRemoved+=weight*fraction;
        }
        return {fdi:d.fdi,vertices:d.vertices,triangles:d.triangles,reachableVertices:d.reachable,unreachableVertices:d.unreachable,
          potentialReachWeight:d.reachableWeight,outsideWeight:d.outsideWeight,maxRegistrationErrorMm:d.maxRegistrationErrorMm,
          // A reproducible vertex-weight diagnostic, not a clinical percentage.
          currentWeightedRemoval:totalWeight?removedWeight/totalWeight:0,outsideRemovedWeight:outsideRemoved};
      })};
  }
  function dispose(){if(disposed)return;disposed=true;object.removeFromParent();for(const p of patches)p.geometry.dispose();material.dispose();object.clear();patches.length=0;}
  return {object,setState,report,dispose};
}
