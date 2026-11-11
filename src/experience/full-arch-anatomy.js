import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDentinSectionGeometry } from './exploded-tooth-parts.js';
import { createLayerAnchorCandidates, createLayerSurfaceProbe } from './anatomy-layer-surfaces.js';
import { storyPulpPickable, storyPulpReveal } from './story-anatomy.js';

// The original Dundee assets supply only the exterior. These shapes are an
// educational approximation, derived separately for each source tooth. They
// are not CT data and must be described as schematic in the user interface.
function rootCount(fdi) {
  const type = fdi % 10;
  if (type >= 6) return fdi < 30 ? 3 : 2;
  return type === 4 && fdi < 30 ? 2 : 1;
}

const profiles = {
  incisor: { rise: .39, width: .22, height: .20, depth: .115, chamberShape: 1.4,
    horns: [[-.45,0,.11],[.45,0,.11]], branchCount: 3 },
  canine: { rise: .41, width: .16, height: .26, depth: .18, chamberShape: .83,
    horns: [[0,0,.37]], branchCount: 4 },
  premolar: { rise: .32, width: .19, height: .23, depth: .24, chamberShape: .78,
    horns: [[0,-.52,.29],[0,.50,.37]], branchCount: 6 },
  molar: { rise: .31, width: .28, height: .24, depth: .26, chamberShape: 1,
    horns: [[-.51,-.47,.27],[-.47,.48,.33],[.47,-.47,.23],[.49,.45,.29]], branchCount: 8 },
};

function toothFamily(fdi) {
  const type = fdi % 10;
  if (type <= 2) return 'incisor';
  if (type === 3) return 'canine';
  return type <= 5 ? 'premolar' : 'molar';
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
function taperedRoot(curve, radius, unified=false, stretchX=1, stretchZ=1) {
  const segments=32, sides=10, frames=curve.computeFrenetFrames(segments,false);
  const data=new Float32Array((segments+1)*(sides+1)*3), uv=new Float32Array((segments+1)*(sides+1)*2), indices=[];
  const center=new THREE.Vector3();
  for(let i=0;i<=segments;i++) {
    const t=i/segments;curve.getPoint(t,center);
    // Single-root teeth have one uninterrupted chamber-to-root volume.
    // Broaden it within the crown, then narrow it through the full root.
    const profile=unified?Math.min(1,Math.max(.02,t/.12))*
      (t<.23?1:Math.max(.025,1-(t-.23)*1.31)):.045+.955*(1-t)**.82;
    const r=radius*profile;
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a),k=(i*(sides+1)+j)*3;
      data[k]=center.x+r*stretchX*(frames.normals[i].x*c+frames.binormals[i].x*s);
      data[k+1]=center.y+r*(frames.normals[i].y*c+frames.binormals[i].y*s);
      data[k+2]=center.z+r*stretchZ*(frames.normals[i].z*c+frames.binormals[i].z*s);
      const u=(i*(sides+1)+j)*2;uv[u]=t;uv[u+1]=j/sides;
      if(i&&j){const q=(i-1)*(sides+1)+j-1,b=q+sides+1;indices.push(q,q+1,b,b,q+1,b+1);}
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
  const fdi = item.entry.fdi, family = toothFamily(fdi), profile = profiles[family];
  const position = geometry.getAttribute('position');
  const cx = (min.x + max.x) * .5, cz = (min.z + max.z) * .5;
  const width = max.x - min.x, depth = max.z - min.z;
  const neck = THREE.MathUtils.clamp(0, min.y + (max.y-min.y)*.40, max.y-(max.y-min.y)*.24);
  const rootLength = neck - min.y, crownHeight = max.y - neck;
  const chamberY = neck + crownHeight * profile.rise;
  const chamberRx=width*profile.width, chamberRy=crownHeight*profile.height, chamberRz=depth*profile.depth;
  const chamber = new THREE.SphereGeometry(1, 24, 16);
  const chamberPosition=chamber.getAttribute('position');
  for(let i=0;i<chamberPosition.count;i++){
    const x=chamberPosition.getX(i),y=chamberPosition.getY(i),z=chamberPosition.getZ(i);
    // The lower end joins the canal while the upper margin gently follows
    // the crown's pulp horns; posterior teeth have a wider chamber.
    const taper=.62+.38*(y+1)*.5;
    const horn=Math.max(0,y)*profile.horns.reduce((sum,[hx,hz,amplitude]) =>
      sum + amplitude * Math.exp(-((x-hx)**2+(z-hz)**2)/.12),0);
    chamberPosition.setXYZ(i,cx+x*chamberRx*taper,
      chamberY+(y+horn)*chamberRy,cz+z*chamberRz*taper);
  }
  chamber.computeVertexNormals();
  const count = rootCount(fdi), levels = [.30, .51, .69, .80];
  const unified=family!=='molar'&&count===1;
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
    if(unified)path.unshift(new THREE.Vector3(cx,chamberY+chamberRy*(family==='canine'?1.20:.96),cz),
      new THREE.Vector3(cx,chamberY+chamberRy*.28,cz));
    // End before the apex: the tight tips and variable furcations do not
    // justify asserting a channel position to the end of each model's root.
    const curve=new THREE.CatmullRomCurve3(path,false,'centripetal');
    const radius=unified?Math.sqrt(chamberRx*chamberRz)*.79:Math.min(width,depth)*.075;
    solids.push(taperedRoot(curve,radius,unified,unified?profile.chamberShape:1,unified?1/profile.chamberShape:1));
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
  patterns.slice(0,profile.branchCount).forEach((pattern,i)=>{
    const points=pattern.map(([x,y,z])=>new THREE.Vector3(cx+x*chamberRx,chamberY+y*chamberRy,cz+z*chamberRz));
    const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
    const branch=new THREE.TubeGeometry(curve,12,Math.min(width,depth)*.007,5,false);
    threads.push(colorThread(branch,i%3===1?'#7861a2':i%3===2?'#e99aab':'#f6d7ba'));
  });
  const solid=mergeGeometries(solids), thread=mergeGeometries(threads);
  for(const part of [...solids,...threads])part.dispose();
  return {solid,thread,count,family,center:new THREE.Vector3(cx,chamberY,cz),
    halfSize:new THREE.Vector3(width*.5,(max.y-min.y)*.5,depth*.5), verticalMid:(max.y+min.y)*.5};
}

const SECTION_COUNT=12;
const ENAMEL_CERVICAL_HEIGHT=.00045;

// Mirror the cutaway fragment discard for actual visible-surface picking.
// The same fitted section uniforms are used for the exterior and dentin.
function sectionDiscards(point,front,parts,{weight,layer,axis,sections},nested) {
  if(!weight.value)return false;
  const {clamp,lerp,smoothstep}=THREE.MathUtils;
  const {center,halfSize:half,verticalMid}=parts;
  const {x:axisX,y:axisZ}=axis.value;
  const width=Math.hypot(half.x*axisZ,half.z*axisX);
  const thickness=Math.hypot(half.x*axisX,half.z*axisZ);
  const open=smoothstep(weight.value,0,1);
  const band=clamp((point.y-verticalMid)/(half.y*2)+.5,0,1)*(SECTION_COUNT-1);
  const low=Math.floor(band),t=band-low;
  const a=sections.value[low],b=sections.value[Math.min(low+1,SECTION_COUNT-1)];
  const across=lerp(center.x*axisZ-center.z*axisX,lerp(a.x,b.x,t),open);
  const depth=lerp(center.x*axisX+center.z*axisZ,lerp(a.z,b.z,t),open);
  const lesson=layer.value>=.00001;
  const dentin=smoothstep(layer.value,1,2);
  const whole=verticalMid+half.y*.015,crown=center.y+half.y*.18;
  const rise=lerp(center.y,lesson?lerp(crown,whole,dentin):whole,open);
  const span=lerp(width,Math.max(width*.11,lerp(a.y,b.y,t)),open);
  let u=Math.abs(point.x*axisZ-point.z*axisX-across)/(span*lerp(.06,lesson?lerp(.58,.88,dentin):.88,open));
  let v=Math.abs(point.y-rise)/(half.y*lerp(.045,lesson?lerp(.34,.88,dentin):.88,open));
  let window=u*u+v**5;
  const depthSpan=lerp(thickness,Math.max(thickness*.11,lerp(a.w,b.w,t)),open);
  const cutDepth=(point.x*axisX+point.z*axisZ-depth)/depthSpan;
  let boundary=lerp(1.02,lesson?lerp(.12,-.33,dentin):-.33,open);
  if(nested) {
    if(window>1.04)return true;
    const pulp=smoothstep(layer.value,2,3);
    u/=lerp(.14,.75,pulp);v/=lerp(.18,.92,pulp);
    window=u*u+v**5;
    boundary=lerp(1.03,-.34,pulp);
  }
  return front&&window<1&&cutDepth>boundary;
}

function fitSections(position, { halfSize,verticalMid }, axis, sections) {
  // Each band records the outside scan's projection. This keeps a small rim
  // even along a sharply tapering root and follows a curved root centreline.
  for(const band of sections)band.set(Infinity,-Infinity,Infinity,-Infinity);
  for(let i=0;i<position.count;i++) {
    const y=(position.getY(i)-verticalMid)/halfSize.y;
    const band=sections[Math.round(THREE.MathUtils.clamp(y*.5+.5,0,1)*(SECTION_COUNT-1))];
    const x=position.getX(i),z=position.getZ(i);
    const across=x*axis.y-z*axis.x,depth=x*axis.x+z*axis.y;
    band.x=Math.min(band.x,across);band.y=Math.max(band.y,across);
    band.z=Math.min(band.z,depth);band.w=Math.max(band.w,depth);
  }
  for(let i=0;i<SECTION_COUNT;i++) {
    if(Number.isFinite(sections[i].x))continue;
    let near=0;
    for(let j=1;j<SECTION_COUNT;j++) {
      if(Number.isFinite(sections[j].x)&&(!Number.isFinite(sections[near].x)||Math.abs(j-i)<Math.abs(near-i)))near=j;
    }
    sections[i].copy(sections[near]);
  }
  for(const band of sections)band.set((band.x+band.y)*.5,(band.y-band.x)*.5,(band.z+band.w)*.5,(band.w-band.z)*.5);
}

function installCutaway(host, parts, shared, lesson=false) {
  const material=host.material;
  const originalCompile=material.onBeforeCompile, originalKey=material.customProgramCacheKey;
  const key=originalKey.call(material), originalSide=material.side;
  const weight=shared?.weight??{value:0}, layer=shared?.layer??{value:0};
  const axis=shared?.axis??{value:new THREE.Vector2(0,1)};
  const sections=shared?.sections??{value:Array.from({length:SECTION_COUNT},()=>new THREE.Vector4())};
  const highlight={value:0};
  const uniforms={weight,layer,axis,sections};
  let open=false;
  material.onBeforeCompile=function(shader,renderer){
    originalCompile.call(this,shader,renderer);
    // Three shares one uniform table across a material's cached programs.
    // Keep these bindings when the closed variant is the last one compiled.
    Object.assign(shader.uniforms,{
      atlasCutWeight:weight,atlasCutAxis:axis,atlasCutCenter:{value:parts.center},
      atlasCutHalf:{value:parts.halfSize},atlasCutMid:{value:parts.verticalMid},atlasCutSections:sections,atlasStoryLayer:layer,
      atlasLayerHighlight:highlight,
    });
    if(!open&&!lesson)return;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vAtlasCutPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvAtlasCutPosition = position;');
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vAtlasCutPosition;');
    if(lesson){
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\nuniform float atlasLayerHighlight;')
        .replace('#include <opaque_fragment>',`
          float selectedTissue = atlasLayerHighlight * ${shared?'1.0':`(gl_FrontFacing ? smoothstep(${ENAMEL_CERVICAL_HEIGHT}, 0.0014, vAtlasCutPosition.y) : 0.0)`};
          outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.87, 0.98, 1.075) + vec3(0.012, 0.023, 0.036), selectedTissue);
          #include <opaque_fragment>`);
    }
    if(!open)return;
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>
        uniform float atlasCutWeight;
        uniform vec2 atlasCutAxis;
        uniform vec3 atlasCutCenter;
        uniform vec3 atlasCutHalf;
        uniform float atlasCutMid;
        uniform float atlasStoryLayer;
        uniform vec4 atlasCutSections[${SECTION_COUNT}];`)
      .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        float atlasWindow = 2.0;
        float atlasCutDepth = -2.0;
        float atlasDepthBoundary = 1.0;
        float atlasLesson = step(0.00001, atlasStoryLayer);
        if (atlasCutWeight > 0.0) {
          vec2 atlasAcross = vec2(atlasCutAxis.y, -atlasCutAxis.x);
          float atlasWidth = length(atlasCutHalf.xz * atlasAcross);
          float atlasThickness = length(atlasCutHalf.xz * atlasCutAxis);
          float atlasOpen = smoothstep(0.0, 1.0, atlasCutWeight);
          float atlasBand = clamp((vAtlasCutPosition.y - atlasCutMid) / (atlasCutHalf.y * 2.0) + 0.5, 0.0, 1.0) * ${SECTION_COUNT-1}.0;
          int atlasBandLow = int(atlasBand);
          vec4 atlasSection = mix(atlasCutSections[atlasBandLow],atlasCutSections[min(atlasBandLow + 1, ${SECTION_COUNT-1})],fract(atlasBand));
          float atlasAcrossCenter = mix(dot(atlasCutCenter.xz, atlasAcross), atlasSection.x, atlasOpen);
          float atlasDepthCenter = mix(dot(atlasCutCenter.xz, atlasCutAxis), atlasSection.z, atlasOpen);
          float dentinStage = smoothstep(1.0, 2.0, atlasStoryLayer);
          float crownSection = atlasCutCenter.y + atlasCutHalf.y * 0.18;
          float wholeSection = atlasCutMid + atlasCutHalf.y * 0.015;
          float atlasRise = mix(atlasCutCenter.y, mix(wholeSection, mix(crownSection, wholeSection, dentinStage), atlasLesson), atlasOpen);
          float atlasSpan = mix(atlasWidth, max(atlasWidth * 0.11, atlasSection.y), atlasOpen);
          float atlasSpanX = mix(0.88, mix(0.58, 0.88, dentinStage), atlasLesson);
          float atlasSpanY = mix(0.88, mix(0.34, 0.88, dentinStage), atlasLesson);
          float atlasU = abs(dot(vAtlasCutPosition.xz, atlasAcross) - atlasAcrossCenter) / (atlasSpan * mix(0.06, atlasSpanX, atlasOpen));
          float atlasV = abs(vAtlasCutPosition.y - atlasRise) / (atlasCutHalf.y * mix(0.045, atlasSpanY, atlasOpen));
          atlasWindow = atlasU * atlasU + pow(atlasV, 5.0);
          float atlasDepthSpan = mix(atlasThickness, max(atlasThickness * 0.11, atlasSection.w), atlasOpen);
          atlasCutDepth = (dot(vAtlasCutPosition.xz, atlasCutAxis) - atlasDepthCenter) / atlasDepthSpan;
          atlasDepthBoundary = mix(1.02, mix(-0.33, mix(0.12, -0.33, dentinStage), atlasLesson), atlasOpen);
          ${shared ? `
          // The native dentin contours sit behind the outer window. A narrower
          // nested section then opens over the existing chamber and canals.
          if (atlasWindow > 1.04) discard;
          float pulpStage = smoothstep(2.0, 3.0, atlasStoryLayer);
          float pulpU = atlasU / mix(0.14, 0.75, pulpStage);
          float pulpV = atlasV / mix(0.18, 0.92, pulpStage);
          atlasWindow = pulpU * pulpU + pow(pulpV, 5.0);
          atlasDepthBoundary = mix(1.03, -0.34, pulpStage);
          ` : ''}
          // A bent root or a thin incisal edge may lie entirely in front of
          // the local depth plane. Its far-facing wall must still remain.
          if (gl_FrontFacing && atlasWindow < 1.0 && atlasCutDepth > atlasDepthBoundary) discard;
        }`)
      .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
        if (atlasCutWeight > 0.0 && !gl_FrontFacing) roughnessFactor = max(roughnessFactor, 0.63);`)
      .replace('#include <opaque_fragment>',`
        if (atlasCutWeight > 0.0) {
          // The opposite inside wall provides depth. The warmer tint is a
          // schematic cue for the dentin exposed by this local section.
          if (!gl_FrontFacing) {
            outgoingLight = outgoingLight * mix(vec3(0.85, 0.76, 0.64), vec3(0.92, 0.87, 0.78), atlasLesson)
              + vec3(0.045, 0.032, 0.019);
          } else {
            float atlasLip = (1.0 - smoothstep(1.0, 1.15, atlasWindow)) *
              smoothstep(atlasDepthBoundary - 0.08, atlasDepthBoundary + 0.16, atlasCutDepth);
            outgoingLight = mix(outgoingLight, outgoingLight * vec3(1.04, 0.91, 0.74), atlasLip * 0.66);
            ${shared ? '' : `
            float crownEnamel = smoothstep(-0.0003, 0.0013, vAtlasCutPosition.y);
            outgoingLight = mix(outgoingLight, outgoingLight * vec3(1.04, 1.055, 1.07) + vec3(0.075, 0.079, 0.082),
              atlasLesson * atlasLip * crownEnamel * 0.78);
            `}
          }
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>open?`${key}-atlas-cutaway-v4-${shared?'dentin':'outer'}-${lesson}`
    :lesson?`${key}-atlas-enamel-highlight`:key;
  return {
    ...uniforms,highlight,
    discards(point,front){return open&&sectionDiscards(point,front,parts,uniforms,Boolean(shared));},
    aim(direction){
      axis.value.set(direction?.x??0,direction?.z??1);
      if(axis.value.lengthSq()<.0001)axis.value.set(0,1);
      else axis.value.normalize();
      fitSections(host.geometry.getAttribute('position'),parts,axis.value,sections.value);
    },
    setOpen(next){
      if(open===next)return;
      open=next;
      material.side=open?THREE.DoubleSide:originalSide;
      material.needsUpdate=true;
    },
    dispose(){
      material.onBeforeCompile=originalCompile;
      material.customProgramCacheKey=originalKey;
      material.side=originalSide;
      material.needsUpdate=true;
    },
  };
}

/** A local illustration assembled lazily inside an existing rooted tooth. */
export function createFullArchAnatomy({ arch }) {
  if (!arch?.assetsReady) throw new Error('The full anatomical atlas must be ready.');
  const pulpColor=new THREE.Color('#a94454'),pulpHighlight=new THREE.Color('#cb7387');
  const tissue=new THREE.MeshPhysicalMaterial({color:pulpColor,roughness:.48,clearcoat:.12,
    clearcoatRoughness:.44,transparent:true,opacity:.97,depthWrite:false});
  const strand=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.55,
    transparent:true,opacity:.86,depthWrite:false});
  const cache=new Map(), items=new Map();
  const probe=createLayerSurfaceProbe(),visibleSurfaces=[],anchors=[];
  const localCamera=new THREE.Vector3(),world=new THREE.Vector3(),projected=new THREE.Vector3(),
    viewDirection=new THREE.Vector3(),cameraDirection=new THREE.Vector3(),testRay=new THREE.Ray();
  let active=null,storyActive=false,storyContext=false,highlighted=null,disposed=false;

  function prepare(fdi) {
    if(items.has(fdi))return items.get(fdi);
    const item=arch.teeth.get(fdi), host=item?.mesh;
    if(!host)return null;
    let parts=cache.get(host.geometry.uuid);
    if(!parts){parts=prepareInterior(item);cache.set(host.geometry.uuid,parts);}
    const group=new THREE.Group();group.name=`Ilustračné vnútro FDI ${fdi}`;group.visible=false;
    for(const [geometry,mat,order] of [[parts.solid,tissue,1],[parts.thread,strand,2]]) {
      const mesh=new THREE.Mesh(geometry,mat);mesh.renderOrder=order;mesh.raycast=()=>{};
      group.add(mesh);
    }
    host.add(group);
    const state={fdi,host,group,parts,cut:installCutaway(host,parts,undefined,fdi===36)};
    items.set(fdi,state);
    return state;
  }

  function prepareDentin(state) {
    if(state.dentin)return state.dentin;
    const material=new THREE.MeshPhysicalMaterial({
      vertexColors:true,roughness:.55,clearcoat:.06,clearcoatRoughness:.47,specularIntensity:.70,
    });
    const mesh=new THREE.Mesh(createDentinSectionGeometry(state.host),material);
    mesh.name='Ilustračný rez dentínom FDI 36';mesh.raycast=()=>{};mesh.visible=false;
    state.host.add(mesh);
    return state.dentin={mesh,cut:installCutaway(mesh,state.parts,state.cut,true)};
  }

  function closeDetail() {
    if(!active)return;
    active.group.visible=false;
    active.cut.weight.value=0;
    active.cut.layer.value=0;
    active.cut.setOpen(false);
    if(active.dentin){active.dentin.mesh.visible=false;active.dentin.cut.setOpen(false);}
    active=null;
  }

  function useDetail(fdi,next,localViewDirection,layer=0) {
    if(disposed)return;
    const value=THREE.MathUtils.clamp(next,0,1);
    const story=layer>0;
    if(active&&(!value||fdi!==active.fdi||story!==storyActive))closeDetail();
    if(!value||fdi==null)return;
    if(!active) {
      active=prepare(fdi);
      if(!active)return;
      storyActive=story;
      active.cut.aim(localViewDirection);
      active.cut.setOpen(true);
      if(story){
        const {mesh,cut}=prepareDentin(active);
        mesh.visible=true;
        cut.setOpen(true);
      }
    }
    active.cut.weight.value=value;
    active.cut.layer.value=layer;
    const showPulp=story?storyPulpReveal(layer):1;
    active.group.visible=showPulp>.001;
    tissue.opacity=.97*showPulp;
    strand.opacity=.86*showPulp;
  }

  function setStoryHighlight(id) {
    if(highlighted===id)return;
    highlighted=id;
    const story=items.get(36);
    if(story)story.cut.highlight.value=id==='enamel'?.48:0;
    if(story?.dentin)story.dentin.cut.highlight.value=id==='dentin'?.54:0;
    tissue.color.copy(pulpColor).lerp(pulpHighlight,id==='pulp'?.36:0);
  }

  function layerSurfaces(state) {
    if(state.layerSurfaces)return state.layerSurfaces;
    const {host,cut,group}=state,{mesh,cut:dentinCut}=prepareDentin(state);
    return state.layerSurfaces=[
      {id:'enamel',object:host,heights:[.83,.93,.73],fragment(point,front){
        if(cut.discards(point,front))return false;
        return front&&point.y>ENAMEL_CERVICAL_HEIGHT?'enamel':null;
      }},
      {id:'dentin',object:mesh,heights:[.77,.68,.55],fragment:(point,front)=>dentinCut.discards(point,front)?false:'dentin'},
      {id:'pulp',object:group.children[0],heights:[.84,.91,.70],fragment:()=> 'pulp'},
      {id:'pulp',object:group.children[1],fragment:()=> 'pulp'},
    ];
  }

  function visibleStorySurfaces(state) {
    visibleSurfaces.length=0;
    if(!state?.host.visible)return visibleSurfaces;
    const [outer,dentin,solid,threads]=layerSurfaces(state);
    visibleSurfaces.push(outer);
    if(active===state&&storyActive){
      if(dentin.object.visible)visibleSurfaces.push(dentin);
      if(state.group.visible&&storyPulpPickable(state.cut.layer.value))visibleSurfaces.push(solid,threads);
    }
    return visibleSurfaces;
  }

  function cameraDepthPerUnit(ray,camera) {
    return camera?-cameraDirection.copy(ray.direction).transformDirection(camera.matrixWorldInverse).z:1;
  }

  function pickStoryLayer(raycaster) {
    const state=storyContext?items.get(36):null;
    const surfaces=visibleStorySurfaces(state);
    if(!surfaces.length)return null;
    const {ray,camera}=raycaster,depth=cameraDepthPerUnit(ray,camera);
    const near=Math.max(raycaster.near,(camera?.near??0)/depth);
    const far=Math.min(raycaster.far,(camera?.far??Infinity)/depth);
    return probe.nearest(surfaces,ray,near,far)?.id??null;
  }

  function getStoryLayerAnchors(camera) {
    anchors.length=0;
    const state=storyContext&&storyActive?active:null;
    if(!state||state.cut.weight.value<.06)return anchors;
    const surfaces=visibleStorySurfaces(state);
    testRay.origin.setFromMatrixPosition(camera.matrixWorld);
    for(const surface of surfaces) {
      if(!surface.heights)continue;
      const {object,id}=surface;
      surface.candidates??=createLayerAnchorCandidates(object,id,surface.heights);
      localCamera.copy(testRay.origin);
      object.worldToLocal(localCamera);
      for(const candidate of surface.candidates){
        const facing=candidate.normal.dot(viewDirection.subVectors(localCamera,candidate.local).normalize());
        const visibleSide=object.material.side===THREE.DoubleSide||facing>0;
        candidate.rank=visibleSide&&surface.fragment(candidate.local,facing>0)===id
          ? Math.abs(facing)-candidate.band*.20:-Infinity;
      }
      surface.candidates.sort((a,b)=>b.rank-a.rank);
      let shown=0;
      for(let i=0;i<Math.min(9,surface.candidates.length)&&shown<2;i++) {
        const candidate=surface.candidates[i];
        if(!Number.isFinite(candidate.rank))break;
        world.copy(candidate.local).applyMatrix4(object.matrixWorld);
        projected.copy(world).project(camera);
        if(Math.abs(projected.x)>1||Math.abs(projected.y)>1||Math.abs(projected.z)>1)continue;
        testRay.direction.subVectors(world,testRay.origin);
        const distance=testRay.direction.length();
        testRay.direction.divideScalar(distance);
        const depth=cameraDepthPerUnit(testRay,camera),near=camera.near/depth;
        const tolerance=.0015;
        const visible=probe.nearest(surfaces,testRay,near,distance+tolerance);
        if(visible?.object===object&&visible.id===id&&Math.abs(visible.distance-distance)<tolerance){
          anchors.push(candidate);shown++;
        }
      }
    }
    return anchors;
  }

  function prewarmStory(renderer,scene,camera) {
    if(disposed||active)return Promise.resolve();
    const state=prepare(36);
    if(!state)return Promise.resolve();
    const {cut}=prepareDentin(state);
    for(const surface of layerSurfaces(state)){
      probe.warm(surface.object);
      if(surface.heights)surface.candidates=createLayerAnchorCandidates(surface.object,surface.id,surface.heights);
    }
    state.cut.setOpen(true);
    cut.setOpen(true);
    let opening;
    try {
      // compileAsync traverses the hidden meshes synchronously before it
      // returns. Keep the real tooth intact while the GPU builds the programs.
      opening=renderer.compileAsync(state.host,camera,scene);
    } finally {
      state.cut.setOpen(false);
      cut.setOpen(false);
    }
    return Promise.all([opening,renderer.compileAsync(state.host,camera,scene)]);
  }

  function dispose() {
    if(disposed)return;
    closeDetail();disposed=true;
    for(const state of items.values()) {
      state.host.remove(state.group);
      state.cut.dispose();
      if(state.dentin){
        const {mesh,cut}=state.dentin;
        state.host.remove(mesh);
        cut.dispose();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    for(const parts of cache.values()){parts.solid.dispose();parts.thread.dispose();}
    tissue.dispose();strand.dispose();
    items.clear();cache.clear();
  }
  return {
    setDetail(fdi,weight,direction){storyContext=false;setStoryHighlight(null);useDetail(fdi,weight,direction);},
    setStoryLayer({cut,amount,highlight},direction){
      storyContext=true;
      if(!items.has(36))prepare(36);
      useDetail(36,cut,direction,amount);
      setStoryHighlight(highlight??null);
    },
    pickStoryLayer,getStoryLayerAnchors,
    prewarmStory,
    dispose,
    report(){
      return {weight:active?.cut.weight.value??0,fdi:active?.fdi??null,family:active?.parts.family??null,
        roots:active?.parts.count??null,teeth:arch.teeth.size,templates:cache.size,
        branches:[...arch.teeth.keys()].map(fdi=>({fdi,count:rootCount(fdi)}))};
    },
  };
}
