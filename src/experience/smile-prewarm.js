import { WebGLRenderTarget } from 'three';

/** Prepare the opaque crowns used when the final handover begins. The normal
 * startup state has them hidden and transparent, which is a different shader
 * variant and leaves their vertex buffers unuploaded. Temporary states are
 * always restored synchronously; this helper owns no animation loop. */
export function prewarmSmileMaterials({ arch, renderer, scene, camera, isAlive = () => true }) {
  if (!arch?.teeth || !renderer?.compileAsync || !scene || !camera) return Promise.resolve(false);

  function withOpaqueCrowns(uncull, action) {
    const saved = [];
    try {
      for (const item of arch.teeth.values()) {
        const mesh = item.crown, finish = item.crownFinish;
        if (!mesh || !finish) continue;
        const material = mesh.material;
        saved.push({ mesh, finish, reveal: finish.getReveal(), visible: mesh.visible,
          castShadow: mesh.castShadow, frustumCulled: mesh.frustumCulled,
          customDepthMaterial: mesh.customDepthMaterial,
          transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite });
        finish.setReveal(1);
        if (uncull) mesh.frustumCulled = false;
      }
      return { result: action(), count: saved.length };
    } finally {
      for (const entry of saved) {
        const { mesh, finish } = entry;
        finish.setReveal(entry.reveal);
        mesh.visible = entry.visible;
        mesh.castShadow = entry.castShadow;
        mesh.frustumCulled = entry.frustumCulled;
        mesh.customDepthMaterial = entry.customDepthMaterial;
        const material = mesh.material;
        if (material.transparent !== entry.transparent) {
          material.transparent = entry.transparent;
          material.needsUpdate = true;
        }
        material.opacity = entry.opacity;
        material.depthWrite = entry.depthWrite;
      }
    }
  }

  const previousTarget = renderer.getRenderTarget();
  let compilation;
  try {
    // Shader variants are keyed on the canvas output colour space. Three's
    // compileAsync starts its traversal synchronously before returning.
    renderer.setRenderTarget(null);
    compilation = withOpaqueCrowns(false, () => renderer.compileAsync(scene, camera));
  } finally {
    renderer.setRenderTarget(previousTarget);
  }
  // A stalled GPU must not prevent the story from becoming available. Three's
  // compileAsync polls indefinitely, so abandon this optional warmup after a
  // short deadline and leave the normal renderer to compile on first use.
  let deadline;
  const boundedCompile = Promise.race([
    Promise.resolve(compilation.result).then(() => true),
    new Promise((resolve) => { deadline = setTimeout(() => resolve(false), 4000); }),
  ]).finally(() => clearTimeout(deadline));
  return boundedCompile.then((compiled) => {
    if (!compiled || !isAlive() || arch.teeth.size === 0 || compilation.count === 0) return false;
    // A 1×1 target uploads every crown buffer once; an offscreen shader may
    // differ from the canvas variant, which was compiled above. The complete
    // scene, material and renderer state are restored before another RAF.
    const target = new WebGLRenderTarget(1, 1);
    const oldTarget = renderer.getRenderTarget();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    try {
      renderer.setRenderTarget(target);
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      withOpaqueCrowns(true, () => renderer.render(scene, camera));
    } finally {
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      renderer.setRenderTarget(oldTarget);
      target.dispose();
    }
    return true;
  });
}
