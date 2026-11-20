import { MeshDepthMaterial, Vector2 } from 'three';
import { prepareMaterial } from '../prototype/materials.js';

/** The approved opaque material, with ordinary alpha composition only during
 * introduction. Writing a white opaque fragment would incorrectly erase an
 * existing tooth behind it. At full reveal the surface is opaque, depth-writing
 * PBR again. Depth is retained during the sorted introduction pass to resolve
 * these closed surfaces consistently near alpha=1. Introduction alpha is not
 * an enamel translucency/SSS model.
 */
export function prepareJourneyMaterial(mesh, config, profile, renderer, clay = false, crownFdi = null) {
  prepareMaterial(mesh, config, profile, renderer, clay);
  const material = mesh.material;
  if(crownFdi!==null&&!clay) {
    mesh.geometry.computeBoundingBox();
    const {min,max}=mesh.geometry.boundingBox;
    const extent={value:new Vector2(min.y,1/(max.y-min.y))},incisor={value:crownFdi%10<=2?1:0};
    const compile=material.onBeforeCompile, key=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer) {
      compile.call(this,shader,renderer);
      shader.uniforms.crownExtent=extent;shader.uniforms.crownIncisor=incisor;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>','#include <common>\nuniform vec2 crownExtent; varying float vCrownHeight;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCrownHeight=(position.y-crownExtent.x)*crownExtent.y;');
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\nuniform float crownIncisor; varying float vCrownHeight;')
        .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
          diffuseColor.rgb *= mix(vec3(1.,.993,.979),vec3(1.),smoothstep(.02,.38,vCrownHeight));`)
        .replace('#include <transmission_fragment>',`#include <transmission_fragment>
          #ifdef USE_ENVMAP
          // A diffuse approximation of light entering the thin incisal edge.
          // The enamel still writes a solid, correctly occluding depth surface.
          if(crownIncisor>.5 && vCrownHeight>.68) {
            float thin=smoothstep(.68,.97,vCrownHeight);
            vec3 reverseLight=getIBLIrradiance(-normal)*RECIPROCAL_PI;
            totalDiffuse=mix(totalDiffuse,reverseLight*vec3(.83,.96,1.03),.13*thin);
          }
          #endif
          // A broad neutral fill moves with the observer. Use the actual
          // shaded normal and the crown's baked occlusion to retain relief
          // around grooves and contacts at every angle of inspection.
          vec3 eye = normalize(vViewPosition);
          float facing = saturate(dot(normal,eye));
          float fillCosine = saturate(dot(normal,normalize(vec3(-.30,.40,1.))));
          vec3 softFill = diffuseColor.rgb * toothAO * (.50+.34*facing+.41*fillCosine*fillCosine);
          totalDiffuse = mix(totalDiffuse,softFill,.66);
          totalDiffuse = mix(vec3(luminance(totalDiffuse)),totalDiffuse,.16);
          // View-space strip reflections travel across the native normals as
          // the camera orbits. Keep the physical studio's specular light too.
          vec3 reflected = reflect(-eye,normal);
          vec2 spread = vec2(.11,.26)+vec2(.29,.46)*material.roughness;
          vec2 key = (reflected.xy-vec2(-.53,.12))/spread;
          vec2 fill = (reflected.xy-vec2(.62,.13))/(spread*vec2(1.08,1.06));
          float sheen = (exp(-dot(key,key))+exp(-dot(fill,fill)))*smoothstep(.30,.72,reflected.z);
          // Neutral in the broad face of the enamel. Only the reflection
          // at a grazing angle picks up a trace of the cool surroundings.
          vec3 pearl = mix(vec3(1.),vec3(.96,.985,1.),1.-facing);
          totalSpecular = (totalSpecular+.65*reflectedLight.directSpecular+2.06*sheen)*pearl;`);
    };
    material.customProgramCacheKey=()=>key+'-cervical-incisal';
  }
  // r186 PCF uses a native depth texture. Built-in hashed coverage makes the
  // *shadow* grow with the reveal instead of switching on at a hard threshold.
  // The visible physical surface never uses an alpha-hashed grain pattern.
  const introductionDepth=new MeshDepthMaterial({alphaHash:true});
  let reveal = 0;
  return {
    material,
    setReveal(value) {
      reveal = value;
      // The first visible flight frame draws roots with alpha. Crowns are
      // already seated when they appear and enter on the opaque program.
      // Keep each hidden material on the variant that compileAsync must warm.
      const fading=value<1&&(crownFdi===null||value>0);
      if(material.transparent!==fading){material.transparent=fading;material.needsUpdate=true;}
      material.opacity=value;
      material.depthWrite=true;
      introductionDepth.opacity=value;
      mesh.customDepthMaterial=fading?introductionDepth:undefined;
      mesh.visible = value > 0.00001;
      mesh.castShadow = mesh.visible;
    },
    getReveal: () => reveal,
    dispose() {introductionDepth.dispose();mesh.customDepthMaterial=undefined;},
  };
}

// Travel from the root tips to the enamel using the full tooth's own axis.
// Only a narrow feather around the travelling boundary uses pixel coverage.
// Both representations share the same local coordinates and seating transform.
const feather=.08;
export function addSmileDissolve(material, mix, extent, crown) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const reject = crown ? 'coverage >= smileMix' : 'coverage < smileMix';
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.smileMix = mix;
    shader.uniforms.smileToothExtent = extent;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 smileToothExtent; varying float vSmileHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSmileHeight=(position.y-smileToothExtent.x)*smileToothExtent.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float smileMix; varying float vSmileHeight;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (${crown?'smileMix <= 0.0':'smileMix >= 1.0'}) discard;
        if (smileMix > 0.0 && smileMix < 1.0) {
          float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float coverage = (clamp(vSmileHeight,0.,1.)+${feather}*grain)/(1.+${feather});
          if (${reject}) discard;
        }
      `);
  };
  material.customProgramCacheKey = () => `${key}-smile-${crown ? 'crown' : 'root'}`;
  material.needsUpdate = true;
}

// Exact lower bound of coverage above. The crown cannot contribute a
// fragment before the travelling boundary reaches its lowest point.
export function crownRevealThreshold(minY,extent) {
  return Math.max(0,(minY-extent.x)*extent.y)/(1+feather);
}
