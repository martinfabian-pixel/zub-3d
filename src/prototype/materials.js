import * as THREE from 'three';

const declarations = `
uniform sampler2D toothRegions;
uniform vec3 toothEnamelColor;
uniform vec3 toothRootColor;
uniform vec2 toothRoughness;
uniform vec2 toothIOR;
uniform vec2 toothNormalStrength;
uniform vec2 toothRoughnessReference;
uniform vec2 toothRoughnessLimits;
uniform float toothColorVariation;
uniform float toothRoughnessVariation;
uniform float toothOcclusionStrength;
uniform float toothScatterFraction;
uniform float toothScatterWrap;
uniform vec4 toothMicro;
uniform vec2 toothFilterFootprint;
uniform vec3 toothMesoRoughness;
varying vec2 vToothUv;
varying vec3 vToothPosition;
float toothCrown;
vec4 toothRegion;
float toothHash(vec3 p) {
  return fract(sin(dot(p, vec3(37.17, 91.73, 61.29)) + 0.013 * p.x * p.z) * 10013.873);
}
float toothMicroNoise(vec3 p) {
  vec3 c = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  float a = mix(toothHash(c), toothHash(c + vec3(1,0,0)), w.x);
  float b = mix(toothHash(c + vec3(0,1,0)), toothHash(c + vec3(1,1,0)), w.x);
  float d = mix(toothHash(c + vec3(0,0,1)), toothHash(c + vec3(1,0,1)), w.x);
  float e = mix(toothHash(c + vec3(0,1,1)), toothHash(c + vec3(1,1,1)), w.x);
  return mix(mix(a,b,w.y), mix(d,e,w.y), w.z);
}
float toothDetailWeight(vec3 cellPosition) {
  return 1.0 - smoothstep(toothFilterFootprint.x, toothFilterFootprint.y, length(fwidth(cellPosition)));
}
`;

function replaceRequired(source, anchor, replacement) {
  if (!source.includes(anchor)) throw new Error(`Three.js r${THREE.REVISION}: missing tooth shader hook ${anchor}`);
  return source.replace(anchor, replacement);
}

/** Opaque spatially varying dielectric, with a very small passive diffuse wrap.
 * No shell refraction, no opacity trick, no emissive/rim term. The wrap is only
 * a punctual/direct-light approximation; area LTC and IBL remain standard PBR.
 */
export function prepareMaterial(model, config, profile, renderer, clay = false) {
  let meshCount = 0;
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    meshCount++;
    if (Array.isArray(mesh.material)) throw new Error('Prototype expects one continuous exterior material per mesh.');
    const source = mesh.material;
    const regions = source.roughnessMap;
    const normal = source.normalMap;
    if (!regions || !normal) throw new Error('Model must include region/roughness data and a tangent-space normal map.');
    // R crown, G roughness, B bounded native tonal variation, A local AO.
    regions.colorSpace = THREE.NoColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    const anisotropy = Math.min(config.quality[profile.compact ? 'compact' : 'desktop'].anisotropy, renderer.capabilities.getMaxAnisotropy());
    regions.anisotropy = normal.anisotropy = anisotropy;
    const { micro, mesoRoughness } = config.material;
    const modelHeight = config.model.height;
    const uniforms = {
      toothRegions: { value: regions },
      toothEnamelColor: { value: new THREE.Color(config.material.enamel.color) },
      toothRootColor: { value: new THREE.Color(config.material.root.color) },
      toothRoughness: { value: new THREE.Vector2(config.material.root.roughness, config.material.enamel.roughness) },
      toothIOR: { value: new THREE.Vector2(config.material.root.ior, config.material.enamel.ior) },
      toothNormalStrength: { value: new THREE.Vector2(config.material.root.normalStrength, config.material.enamel.normalStrength) },
      toothRoughnessReference: { value: new THREE.Vector2(config.material.mapReference.rootRoughness, config.material.mapReference.enamelRoughness) },
      toothRoughnessLimits: { value: new THREE.Vector2(...config.material.mapReference.roughnessLimits) },
      toothColorVariation: { value: config.material.colorVariation },
      toothRoughnessVariation: { value: config.material.roughnessVariation / config.material.mapReference.roughnessVariation },
      toothOcclusionStrength: { value: config.material.occlusionStrength },
      toothScatterFraction: { value: config.material.scattering.fraction },
      toothScatterWrap: { value: config.material.scattering.wrap },
      toothMicro: { value: new THREE.Vector4(micro.wavelengthToHeight * modelHeight,
        micro.amplitudeToHeight * modelHeight, micro.rootAmplitudeToHeight * modelHeight, micro.rootAxialFrequency) },
      toothFilterFootprint: { value: new THREE.Vector2(micro.filterFootprintStart, micro.filterFootprintEnd) },
      toothMesoRoughness: { value: new THREE.Vector3(mesoRoughness.wavelengthToHeight * modelHeight,
        mesoRoughness.enamelAmplitude, mesoRoughness.rootAmplitude) },
    };
    const material = new THREE.MeshPhysicalMaterial({
      name: clay ? 'Neutral clay — geometry review' : 'Ivory enamel and matte cementum — one continuous surface',
      color: clay ? config.material.clay.color : 0xffffff,
      roughness: clay ? config.material.clay.roughness : 1,
      normalMap: clay ? null : normal,
      metalness: 0, opacity: 1, transparent: false,
      ior: config.material.enamel.ior,
      clearcoat: config.material.clearcoat,
      transmission: config.material.transmission,
      dithering: true,
    });
    // Keep loaded maps owned even during clay inspection; dispose closes them.
    material.userData.ownedUniforms = uniforms;
    material.userData.approximation = 'Opaque enamel body, 6.5% direct-light diffuse wrap; not volumetric SSS or measured tissue optics.';
    if (!clay) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = replaceRequired(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec2 vToothUv;\nvarying vec3 vToothPosition;');
        shader.vertexShader = replaceRequired(shader.vertexShader, '#include <uv_vertex>', '#include <uv_vertex>\nvToothUv = uv;');
        shader.vertexShader = replaceRequired(shader.vertexShader, '#include <project_vertex>', '#include <project_vertex>\nvToothPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <common>', `#include <common>\n${declarations}`);
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <color_fragment>', `
          #include <color_fragment>
          toothRegion = texture2D(toothRegions, vToothUv);
          toothCrown = toothRegion.r;
          diffuseColor.rgb *= mix(toothRootColor, toothEnamelColor, toothCrown);
          diffuseColor.rgb += (toothRegion.b - 0.5) * toothColorVariation;
        `);
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <roughnessmap_fragment>', `
          float roughnessFactor = mix(toothRoughness.x, toothRoughness.y, toothCrown);
          // The authored G map is centered on its regional reference values.
          float roughnessReference = mix(toothRoughnessReference.x, toothRoughnessReference.y, toothCrown);
          roughnessFactor += (toothRegion.g - roughnessReference) * toothRoughnessVariation;
          // A separate, zero-centred illustrative field modulates only roughness.
          vec3 mesoP = vToothPosition / toothMesoRoughness.x;
          float mesoVariation = (2.0 * toothMicroNoise(mesoP) - 1.0) * toothDetailWeight(mesoP);
          roughnessFactor += mesoVariation * mix(toothMesoRoughness.z, toothMesoRoughness.y, toothCrown);
          roughnessFactor = clamp(roughnessFactor, toothRoughnessLimits.x, toothRoughnessLimits.y);
        `);
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * mix(toothNormalStrength.x, toothNormalStrength.y, toothCrown);') + `
          // Both illustrative fields stay continuous across UV seams. Cementum
          // uses a longer axial cell; neither field contains growth bands.
          vec3 enamelP = vToothPosition / toothMicro.x;
          vec3 rootP = enamelP * vec3(1.0, toothMicro.w, 1.0);
          float enamelH = toothMicroNoise(enamelP) - 0.5;
          float rootH = toothMicroNoise(rootP) - 0.5;
          // Differentiate only the raw heights. Differentiating the footprint
          // would require undefined second derivatives; differentiating the
          // crown mask would introduce a spurious height ridge at the neck.
          vec2 enamelSlope = vec2(dFdx(enamelH), dFdy(enamelH)) * toothMicro.y * toothDetailWeight(enamelP);
          vec2 rootSlope = vec2(dFdx(rootH), dFdy(rootH)) * toothMicro.z * toothDetailWeight(rootP);
          vec2 slope = mix(rootSlope, enamelSlope, toothCrown);
          vec3 surfaceX = dFdx(-vViewPosition);
          vec3 surfaceY = dFdy(-vViewPosition);
          vec3 gradientX = cross(surfaceY, normal);
          vec3 gradientY = cross(normal, surfaceX);
          float determinant = dot(surfaceX, gradientX);
          vec3 surfaceGradient = sign(determinant) * (slope.x * gradientX + slope.y * gradientY);
          if (abs(determinant) > 1e-12) normal = normalize(abs(determinant) * normal - surfaceGradient);
        `);
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('material.ior = ior;', 'material.ior = mix(toothIOR.x, toothIOR.y, toothCrown);'));
        const lambert = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
        const lighting = replaceRequired(THREE.ShaderChunk.lights_physical_pars_fragment, lambert, `
          float wrappedCosine = max(dot(geometryNormal, directLight.direction) + toothScatterWrap, 0.0) / pow(1.0 + toothScatterWrap, 2.0);
          vec3 bodyIrradiance = mix(irradiance, directLight.color * wrappedCosine, toothScatterFraction * toothCrown);
          reflectedLight.directDiffuse += bodyIrradiance * BRDF_Lambert(material.diffuseContribution) * (1.0 - F);
        `);
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <lights_physical_pars_fragment>', lighting);
        shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <aomap_fragment>', `
          float toothAO = mix(1.0, toothRegion.a, toothOcclusionStrength);
          reflectedLight.indirectDiffuse *= toothAO;
          #if defined(USE_ENVMAP)
            reflectedLight.indirectSpecular *= computeSpecularOcclusion(saturate(dot(geometryNormal, geometryViewDir)), toothAO, material.roughness);
          #endif
        `);
      };
      material.customProgramCacheKey = () => 'zub-continuous-ivory-r186-v2';
    }
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // The asset contains no core, inner shell, transparent cap or second tooth.
    source.dispose();
    const kept = new Set([regions, normal]);
    for (const value of Object.values(source)) if (value?.isTexture && !kept.has(value)) { value.source?.data?.close?.(); value.dispose(); }
  });
  if (meshCount !== config.model.expectedMeshes) throw new Error(`Expected one tooth exterior; received ${meshCount} meshes.`);
}
