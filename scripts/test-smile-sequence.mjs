import assert from 'node:assert/strict';
import { Matrix4 } from 'three';
import { createFloatingTeeth, floatingAmount } from '../src/experience/floating-teeth.js';

const teeth = new Map();
for (const fdi of [11, 12, 21, 22, 31, 32, 41, 42]) {
  const side = Math.floor(fdi / 10) % 2 ? -1 : 1;
  teeth.set(fdi, {
    upper: fdi < 30,
    mesh: { matrix: new Matrix4().makeTranslation(side * fdi / 100, fdi / 1000, 0), updateMatrixWorld() {} },
  });
}
const animation = createFloatingTeeth(teeth);
const capture = () => [...teeth.values()].map(item => item.mesh.matrix.toArray());
const initial = capture();
assert.equal(floatingAmount(.79), 0);
assert.equal(floatingAmount(.87), 1);
assert.equal(floatingAmount(.98), 0);
animation.update(.87, 0);
const dispersed = capture();
assert.notDeepEqual(dispersed, initial);
animation.update(.89, 0);
assert.notDeepEqual(capture(), dispersed, 'Paths keep moving during the fully visible phase');
animation.update(.87, 0, true);
assert.notDeepEqual(capture(), dispersed, 'Portrait framing uses a narrower dispersion');
animation.update(.98, 0);
assert.deepEqual(capture(), initial);
animation.update(.87, 0);
assert.deepEqual(capture(), dispersed, 'Reverse scrolling reconstructs the same poses');
animation.update(.76, 0);
assert.deepEqual(capture(), initial);
// A fine traversal catches discontinuities at each individual launch and
// landing boundary; the same absolute sampler must work in either direction.
let previous = capture();
for(let i=0;i<=4000;i++) {
  const p=.79+.21*i/4000;
  animation.update(p,0);
  const next=capture();
  for(let tooth=0;tooth<next.length;tooth++) for(let j=0;j<16;j++) {
    assert.ok(Number.isFinite(next[tooth][j]), 'Flight matrices remain finite');
    assert.ok(Math.abs(next[tooth][j]-previous[tooth][j])<.03, 'No jump between neighbouring progress samples');
  }
  previous=next;
}
console.log('Floating teeth: absolute progress, settling and reverse reconstruction passed.');
