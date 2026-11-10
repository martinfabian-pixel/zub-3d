import assert from 'node:assert/strict';
import { createNavigationMotion } from '../src/experience/navigation-motion.js';

for (const [from,to] of [[0,.21],[.21,.33],[.995,0],[.475,.76]]) {
  const motion=createNavigationMotion(from,to,1000);
  assert.equal(motion.sample(1000).progress,from);
  let previous=from;
  for(let now=1010;now<=4000;now+=10){
    const {progress,done}=motion.sample(now);
    assert.ok(to>from?progress>=previous:progress<=previous,'navigation never reverses');
    assert.ok(progress>=Math.min(from,to)&&progress<=Math.max(from,to),'no overshoot');
    previous=progress;
    if(done)break;
  }
  assert.equal(previous,to);
  // Sampling at a fixed time does not depend on intervening frame rate.
  assert.equal(motion.sample(1500).progress,createNavigationMotion(from,to,1000).sample(1500).progress);
}
console.log('Button navigation: forward, reverse, bounded easing and frame-rate-independent sampling passed.');
