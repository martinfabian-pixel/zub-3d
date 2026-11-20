/** Compile the crowns for the actual canvas output while the molar turns.
 * Three visits hidden meshes during compilation, so no draw, offscreen
 * framebuffer, or visibility changes are necessary. */
export async function prewarmSmileMaterials({arch,renderer,scene,camera}) {
  const variants=[];
  let compilation;
  try {
    for(const {crown} of arch.teeth.values()){
      if(!crown?.material.transparent)continue;
      variants.push(crown.material);
      crown.material.transparent=false;
      crown.material.needsUpdate=true;
    }
    // Three traverses the scene synchronously, then polls GPU completion.
    compilation=renderer.compileAsync(scene,camera);
  } finally {
    for(const material of variants){
      material.transparent=true;
      material.needsUpdate=true;
    }
  }
  let timer;
  try {
    await Promise.race([
      compilation,
      new Promise(resolve=>{timer=setTimeout(resolve,4000);}),
    ]);
  } finally {clearTimeout(timer);}
}
