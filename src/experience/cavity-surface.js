import { BufferAttribute, BufferGeometry } from 'three';

/** Replace native faces only inside the distal patch. The source and its
 * contralateral instance keep their original attributes and triangle index. */
export function refineCavitySurface(source, data) {
  const recipe = data.refinement;
  const sourceCount = source.getAttribute('position').count;
  const sourceFaces = source.index.count / 3;
  const addedCount = recipe.edgeMidpoints.length / 2;
  const replaced = new Set(recipe.replacedFaces);
  if (sourceCount !== recipe.sourceVertexCount || sourceFaces !== recipe.sourceTriangleCount
    || data.vertexCount !== sourceCount + addedCount || !Number.isInteger(addedCount)
    || recipe.triangles.length !== 3 * recipe.parentFaces.length
    || data.triangleCount !== sourceFaces - replaced.size + recipe.parentFaces.length
    || replaced.size !== recipe.replacedFaces.length
    || recipe.replacedFaces.some(id => !Number.isInteger(id) || id < 0 || id >= sourceFaces)
    || recipe.triangles.some(id => !Number.isInteger(id) || id < 0 || id >= data.vertexCount)) {
    throw new Error('Cavity refinement does not match the native FDI36 surface.');
  }
  for (let i = 0; i < recipe.edgeMidpoints.length; i++) {
    const id = recipe.edgeMidpoints[i];
    if (!Number.isInteger(id) || id < 0 || id >= sourceCount + Math.floor(i/2)) {
      throw new Error('Invalid cavity edge midpoint.');
    }
  }
  const geometry = new BufferGeometry();
  geometry.name = source.name;
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const width = attribute.itemSize;
    const array = new Float32Array(data.vertexCount * width);
    for (let i=0; i<sourceCount; i++) for (let k=0; k<width; k++) {
      array[i*width+k] = attribute.getComponent(i,k);
    }
    for (let i=0; i<addedCount; i++) {
      const a=recipe.edgeMidpoints[2*i]*width, b=recipe.edgeMidpoints[2*i+1]*width;
      const start=(sourceCount+i)*width;
      for (let k=0; k<width; k++) array[start+k]=(array[a+k]+array[b+k])*.5;
      if (name==='normal' || name==='tangent') {
        const length=Math.hypot(array[start],array[start+1],array[start+2]);
        if (length>0) for(let k=0;k<3;k++) array[start+k]/=length;
        if (name==='tangent') array[start+3]=Math.sign(array[a+3]);
      }
    }
    geometry.setAttribute(name,new BufferAttribute(array,width));
  }
  const IndexArray = data.vertexCount>65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(data.triangleCount*3);
  let written=0;
  for (let face=0; face<sourceFaces; face++) {
    if (replaced.has(face)) continue;
    for (let k=0;k<3;k++) indices[written++]=source.index.getX(face*3+k);
  }
  indices.set(recipe.triangles,written);
  geometry.setIndex(new BufferAttribute(indices,1));
  geometry.boundingBox=source.boundingBox?.clone()??null;
  geometry.boundingSphere=source.boundingSphere?.clone()??null;
  geometry.userData.lesionRefinement=recipe;
  geometry.userData.lesionSourceIndex=source.index;
  return geometry;
}
