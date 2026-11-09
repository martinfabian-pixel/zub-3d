import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The original Dundee assets supply only the exterior. These shapes are an
// educational approximation, derived separately for each source tooth. They
// are not CT data and must be described as schematic in the user interface.
function rootCount(fdi) {
  const type = fdi % 10;
  if (type >= 6) return fdi < 30 ? 3 : 2;
  return type === 4 && fdi < 30 ? 2 : 1;
}

function sampleBand(position, y, halfBand) {
  const points = [];
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - y) <= halfBand) points.push([position.getX(i), position.getZ(i)]);
  }
  return points;
}

// Surface samples at a root cross-section form rings. Farthest-point seeds and
// a few k-means iterations locate their centres without processing geometry
// during rendering. Each tooth uses its actual source bounds and contours.
function cluster(points, count) {
  if (!points.length) return Array.from({ length: count }, () => [0, 0]);
  const centers = [points.reduce((a, p) => p[0] < a[0] ? p : a, points[0]).slice()];
  while (centers.length < count) {
    let best = points[0], bestDistance = -1;
    for (const p of points) {
      const distance = Math.min(...centers.map(c => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2));
      if (distance > bestDistance) { bestDistance = distance; best = p; }
    }
    centers.push(best.slice());
  }
  for (let iteration = 0; iteration < 8; iteration++) {
    const sums = centers.map(() => [0, 0, 0]);
    for (const p of points) {
      let index = 0, nearest = Infinity;
      centers.forEach((c, i) => {
        const distance = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
        if (distance < nearest) { index = i; nearest = distance; }
      });
      sums[index][0] += p[0]; sums[index][1] += p[1]; sums[index][2]++;
    }
    sums.forEach((s, i) => { if (s[2]) centers[i] = [s[0] / s[2], s[1] / s[2]]; });
  }
  return centers;
}

// Pulp is a continuous volume tapering into each root, rather than a thin
// wire attached to a round chamber. Built once, never in the render loop.
function taperedRoot(curve, radius, unified=false, stretchX=1) {
  const segments=32, sides=10, frames=curve.computeFrenetFrames(segments,false);
  const data=new Float32Array((segments+1)*(sides+1)*3), uv=new Float32Array((segments+1)*(sides+1)*2), indices=[];
  const center=new THREE.Vector3();
  for(let i=0;i<=segments;i++) {
    const t=i/segments;curve.getPoint(t,center);
    // Single-root teeth have one uninterrupted chamber-to-root volume.
    // Broaden it within the crown, then narrow it through the full root.
    const profile=unified?Math.min(1,Math.max(.08,t/.085))*
      (t<.24?1:Math.max(.12,1-(t-.24)*1.16)):.18+.82*(1-t)**.78;
    const r=radius*profile;
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a),k=(i*(sides+1)+j)*3;
      data[k]=center.x+r*stretchX*(frames.normals[i].x*c+frames.binormals[i].x*s);
      data[k+1]=center.y+r*(frames.normals[i].y*c+frames.binormals[i].y*s);
      data[k+2]=center.z+r*(frames.normals[i].z*c+frames.binormals[i].z*s);
      const u=(i*(sides+1)+j)*2;uv[u]=t;uv[u+1]=j/sides;
      if(i&&j){const q=(i-1)*(sides+1)+j-1,b=q+sides+1;indices.push(q,b,q+1,b,b+1,q+1);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

function colorThread(geometry, color) {
  const value=new THREE.Color(color), colors=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=value.r;colors[i+1]=value.g;colors[i+2]=value.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}

function prepareInterior(item) {
  const geometry = item.mesh.geometry;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const position = geometry.getAttribute('position');
  const cx = (min.x + max.x) * .5, cz = (min.z + max.z) * .5;
  const width = max.x - min.x, depth = max.z - min.z;
  const neck = THREE.MathUtils.clamp(0, min.y + (max.y-min.y)*.40, max.y-(max.y-min.y)*.24);
  const rootLength = neck - min.y, crownHeight = max.y - neck;
  const front = item.entry.fdi % 10 <= 3;
  const chamberY = neck + crownHeight * (front ? .28 : .32);
  const chamberRx=width*(front?.20:.27), chamberRy=crownHeight*(front?.18:.25), chamberRz=depth*.20;
  const chamber = new THREE.SphereGeometry(1, 24, 16);
  const chamberPosition=chamber.getAttribute('position');
  for(let i=0;i<chamberPosition.count;i++){
    const x=chamberPosition.getX(i),y=chamberPosition.getY(i),z=chamberPosition.getZ(i);
    // The lower end joins the canal while the upper margin gently follows
    // the crown's pulp horns; posterior teeth have a wider chamber.
    const taper=.68+.32*(y+1)*.5;
    const horn=front?.06*Math.max(0,y)*(1-Math.abs(x)):
      .13*Math.max(0,y)*(Math.exp(-((x-.48)**2+(z-.35)**2)/.13)+Math.exp(-((x+.48)**2+(z+.35)**2)/.13));
    chamberPosition.setXYZ(i,cx+x*chamberRx*taper,
      chamberY+(y+horn)*chamberRy,cz+z*chamberRz*taper);
  }
  chamber.computeVertexNormals();
  const count = rootCount(item.entry.fdi), levels = [.33, .55, .74];
  const unified=front&&count===1;
  const solids = unified?[]:[chamber], threads = [];
  if(unified)chamber.dispose();
  const slices = levels.map(t => {
    const y = neck - rootLength*t;
    return sampleBand(position, y, rootLength*.035);
  });
  let centers = cluster(slices[1], count);
  const paths = centers.map(() => []);
  for (let l=0;l<levels.length;l++) {
    const points=slices[l], sums=centers.map(()=>[0,0,0]);
    for (const p of points) {
      let index=0, nearest=Infinity;
      for (let i=0;i<centers.length;i++) {
        const c=centers[i], d=(p[0]-c[0])**2+(p[1]-c[1])**2;
        if(d<nearest){nearest=d;index=i;}
      }
      sums[index][0]+=p[0];sums[index][1]+=p[1];sums[index][2]++;
    }
    for(let i=0;i<centers.length;i++) {
      const s=sums[i], px=s[2]?s[0]/s[2]:centers[i][0], pz=s[2]?s[1]/s[2]:centers[i][1];
      paths[i].push(new THREE.Vector3(px,neck-rootLength*levels[l],pz));
    }
  }
  for(const path of paths) {
    const mid=path[0];
    // Start within the pulp chamber, not exactly on its lower surface: the
    // root volume must read as continuous tissue instead of a ball on a wire.
    path.unshift(new THREE.Vector3(THREE.MathUtils.lerp(cx,mid.x,.34),chamberY-chamberRy*.42,THREE.MathUtils.lerp(cz,mid.z,.34)));
    if(unified)path.unshift(new THREE.Vector3(cx,neck+crownHeight*.26,cz),
      new THREE.Vector3(cx,neck+crownHeight*.43,cz));
    if(unified) [path[0],path[1]]=[path[1],path[0]];
    // End before the apex: the tight tips and variable furcations do not
    // justify asserting a channel position to the end of each model's root.
    const curve=new THREE.CatmullRomCurve3(path,false,'centripetal');
    const radius=Math.min(width,depth)*(unified?.18:front?.115:.105);
    solids.push(taperedRoot(curve,radius,unified,unified?Math.min(1.5,width/depth):1));
    const visible=path.map(p=>p.clone().add(new THREE.Vector3(0,0,radius*.20)));
    threads.push(colorThread(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(visible,false,'centripetal'),20,radius*.105,5,false),'#f9ddb6'));
  }
  // Delicate, illustrative nerve/vessel branches sit within the chamber. The
  // network is integrated into shared buffers, with no per-fibre objects.
  const patterns=[
    [[0,-.48,.30],[-.23,-.08,.38],[-.38,.34,.29],[-.30,.65,.12]],
    [[0,-.48,.30],[.23,-.08,.38],[.40,.28,.26],[.32,.62,.10]],
    [[-.23,-.08,.38],[-.04,.16,.45],[.14,.39,.29],[.06,.70,.10]],
    [[.23,-.08,.38],[.03,.11,.47],[-.15,.35,.30],[-.06,.68,.08]],
    [[-.23,-.08,.38],[-.32,.05,.39],[-.51,.21,.25],[-.48,.47,.13]],
    [[.23,-.08,.38],[.31,.06,.39],[.52,.20,.25],[.48,.47,.13]],
    [[-.04,.16,.45],[-.15,.30,.38],[-.28,.47,.23],[-.22,.69,.08]],
    [[.03,.11,.47],[.15,.28,.39],[.27,.46,.23],[.22,.69,.08]],
  ];
  patterns.forEach((pattern,i)=>{
    const points=pattern.map(([x,y,z])=>new THREE.Vector3(cx+x*chamberRx,chamberY+y*chamberRy,cz+z*chamberRz));
    const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
    const branch=new THREE.TubeGeometry(curve,12,Math.min(width,depth)*.007,5,false);
    threads.push(colorThread(branch,i%3===1?'#7861a2':i%3===2?'#e99aab':'#f6d7ba'));
  });
  const solid=mergeGeometries(solids), thread=mergeGeometries(threads);
  for(const part of [...solids,...threads])part.dispose();
  return {solid,thread,count};
}

/** Full rooted arch x-ray is opt-in and schematically authored per tooth. */
export function createFullArchAnatomy({ arch }) {
  if (!arch?.assetsReady) throw new Error('The full anatomical atlas must be ready.');
  const tissue=new THREE.MeshPhysicalMaterial({color:'#b53d4e',roughness:.42,clearcoat:.16,clearcoatRoughness:.42,transparent:true,depthWrite:false});
  const strand=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.52,transparent:true,depthWrite:false});
  const blue=new THREE.Color('#8bcaf1'), cache=new Map(), items=[];
  // One shared uniform shades only the already-present tooth surfaces; no
  // duplicate meshes, render passes or per-frame shader recompilation.
  const rimWeight={value:0};
  let weight=0,disposed=false;
  for(const item of arch.teeth.values()) {
    if(!item.mesh||!item.finish)throw new Error(`Missing FDI ${item.entry.fdi}`);
    const host=item.mesh, material=host.material;
    // Geometry UUID incorporates reflection. Duplicates can share buffers.
    let parts=cache.get(host.geometry.uuid);
    if(!parts){parts=prepareInterior(item);cache.set(host.geometry.uuid,parts);}
    const group=new THREE.Group();group.name=`Ilustračné vnútro FDI ${item.entry.fdi}`;group.visible=false;
    for(const [geometry,mat,order] of [[parts.solid,tissue,1],[parts.thread,strand,2]]) {
      const mesh=new THREE.Mesh(geometry,mat);mesh.renderOrder=order;mesh.raycast=()=>{};
      mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);
    }
    host.add(group);
    const color=material.color.clone(), originalOrder=host.renderOrder, originalReveal=item.finish.setReveal;
    const originalCompile=material.onBeforeCompile, originalProgramKey=material.customProgramCacheKey;
    const programKey=originalProgramKey.call(material);
    material.onBeforeCompile=function(shader,renderer){
      originalCompile.call(this,shader,renderer);
      shader.uniforms.archXrayWeight=rimWeight;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
        '#include <common>\nuniform float archXrayWeight;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        float archRim=pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),2.3);
        outgoingLight=mix(outgoingLight,max(outgoingLight,vec3(.36,.58,.76)),archXrayWeight*archRim*.42);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>programKey+'-arch-rim-v1';
    material.needsUpdate=true;
    const state={item,host,material,group,color,originalOrder,originalReveal,originalCompile,originalProgramKey,lastReveal:item.finish.getReveal?.()??item.reveal,count:parts.count};
    item.finish.setReveal=value=>{
      state.lastReveal=value;
      if(weight>0 && value>.99999) {
        host.visible=true;host.castShadow=false;material.opacity=1-.68*weight;material.depthWrite=false;
        if(!material.transparent){material.transparent=true;material.needsUpdate=true;}
      } else originalReveal(value);
    };
    items.push(state);
  }
  function setWeight(next) {
    if(disposed)return;
    const value=THREE.MathUtils.clamp(next,0,1);
    if(value===0 && weight===0)return;
    weight=value;rimWeight.value=value;tissue.opacity=.96*weight;strand.opacity=.96*weight;
    for(const state of items) {
      const {host,material,group,color,originalOrder,originalReveal}=state;
      group.visible=weight>.001 && host.visible;
      material.color.copy(color).lerp(blue,weight);
      host.renderOrder=weight>0?3:originalOrder;
      if(weight>0) {
        material.opacity=1-.68*weight;material.depthWrite=false;host.castShadow=false;
        if(!material.transparent){material.transparent=true;material.needsUpdate=true;}
      } else originalReveal(state.lastReveal);
    }
  }
  function dispose() {
    if(disposed)return;
    setWeight(0);disposed=true;
    for(const state of items) {
      state.item.finish.setReveal=state.originalReveal;
      state.host.remove(state.group);state.host.renderOrder=state.originalOrder;
      state.material.onBeforeCompile=state.originalCompile;
      state.material.customProgramCacheKey=state.originalProgramKey;
      state.material.needsUpdate=true;
    }
    for(const parts of cache.values()){parts.solid.dispose();parts.thread.dispose();}
    tissue.dispose();strand.dispose();
  }
  return { setWeight,dispose,report(){return {weight,teeth:items.length,templates:cache.size,branches:items.map(x=>({fdi:x.item.entry.fdi,count:x.count}))};},get weight(){return weight;} };
}
