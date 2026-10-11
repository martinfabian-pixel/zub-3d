import * as THREE from 'three';

// This is a bounded, light-dependent approximation to dentin subsurface
// scattering, not a volumetric/path-traced tissue simulation. It redistributes
// 18% of punctual/directional direct diffuse energy into a normalized wrapped
// lobe. Area-light LTC and environment illumination do not use this approximation.
// There is no emissive/ambient lift; shadowed incident light remains shadowed.
function addDentinScattering(material) {
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  const originalDiffuse = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  const wrappedDiffuse = `
    float dentinNdotL = dot( geometryNormal, directLight.direction );
    float dentinWrapped = max( dentinNdotL + 0.35, 0.0 ) / ( 1.35 * 1.35 );
    vec3 dentinScattered = directLight.color * dentinWrapped * vec3( 1.0, 0.94, 0.83 );
    vec3 dentinIrradiance = mix( irradiance, dentinScattered, 0.18 );
    reflectedLight.directDiffuse += dentinIrradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
  `;
  const physicalLighting = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!physicalLighting.includes(originalDiffuse)) throw new Error('Unsupported Three.js physical lighting shader.');
  const wrappedLighting = physicalLighting.replace(originalDiffuse, wrappedDiffuse);
  const cacheKey = previousCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', wrappedLighting);
  };
  material.customProgramCacheKey = () => `${cacheKey}|dentin-wrap-r186-v1`;
  material.userData.scatteringApproximation = '18% normalized diffuse wrap for punctual/directional lights only; excludes area LTC and IBL; not volumetric scattering.';
  material.needsUpdate = true;
}

/** Keep authored optical maps; adapt units and render order for tissue layers. */
export function prepareToothMaterials(model, presentationScale, renderer, compact) {
  const materials = new Set();
  const textures = new Set();
  const tissueCounts = { enamel: 0, dentin: 0, cementum: 0 };
  let meshes = 0;
  let assetTriangles = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    assetTriangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const names = [object.name, ...objectMaterials.map((material) => material.name)];
    // Match the explicit tissue contract, not an old combined material whose
    // descriptive name happened to mention both enamel and roots.
    const tissues = names.map((name) => name.toLowerCase().split(/[_.\s-]/)[0]);
    const enamel = tissues.some((tissue) => tissue.startsWith('enamel'));
    const dentin = tissues.some((tissue) => tissue.startsWith('dentin'));
    const cementum = tissues.some((tissue) => tissue.startsWith('cementum'));
    if (enamel) tissueCounts.enamel++;
    if (dentin) tissueCounts.dentin++;
    if (cementum) tissueCounts.cementum++;

    // The opaque core supplies occlusion. An opaque shadow from the transmissive
    // enamel shell would incorrectly darken the dentin underneath it.
    object.castShadow = !enamel;
    object.receiveShadow = true;
    object.renderOrder = enamel ? 1 : 0;
    for (const material of objectMaterials) {
      if (materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
      const anisotropy = Math.min(compact ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
      for (const map of [material.map, material.normalMap, material.roughnessMap, material.thicknessMap, material.aoMap]) {
        if (map) map.anisotropy = anisotropy;
      }
      // glTF volume thickness is local-space and Three scales it via modelMatrix.
      // Attenuation distance is world-space; presentation normalization must
      // change it once. Do not additionally scale thickness or its texture.
      if (material.thickness > 0 && Number.isFinite(material.attenuationDistance) && material.attenuationDistance > 0) {
        material.attenuationDistance *= presentationScale;
      }
      if (dentin && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) addDentinScattering(material);
    }
  });
  // This is an estimate for decoded material image storage, including mipmaps.
  // It excludes environment maps, shadow/refraction targets and driver overhead.
  let assetTextureBytes = 0;
  for (const texture of textures) {
    if (texture.isCompressedTexture) {
      assetTextureBytes += texture.mipmaps.reduce((sum, mip) => sum + (mip.data?.byteLength ?? 0), 0);
    } else {
      const image = texture.image;
      const bytesPerChannel = texture.type === THREE.FloatType ? 4 : texture.type === THREE.HalfFloatType ? 2 : 1;
      assetTextureBytes += (image?.width ?? 0) * (image?.height ?? 0) * 4 * bytesPerChannel * (texture.generateMipmaps ? 4 / 3 : 1);
    }
  }
  return { meshes, tissueCounts, assetTriangles, assetTextureBytes };
}
