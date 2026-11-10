import assert from 'node:assert/strict';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';
import { sampleStageTypography,TYPE_COMPOSITIONS } from '../src/experience/stage-typography.js';

const names=['Začína sa to jedným zubom.','Aj medzi zubami.','Nenápadný povlak.','Stavba zdravého zuba',
  'Jemne tam a späť.','Čistý priestor. Zdravý zub.','Malý návyk. Veľký rozdiel.'];
assert.deepEqual(DENTAL_CHAPTERS.map(c=>c.title),names);
for(const chapter of DENTAL_CHAPTERS){
  assert.equal(chapter.titleLines.length,2);
  assert.equal(chapter.titleLines.join(' '),chapter.title);
  assert.ok(chapter.titleLines.every(line=>line.trim()===line&&line.length>2));
}
assert.deepEqual(Object.keys(TYPE_COMPOSITIONS),DENTAL_CHAPTERS.map(c=>c.id));
const progress=Array.from({length:2001},(_,i)=>i/2000);
const chapterAt=p=>DENTAL_CHAPTERS.findLast(c=>p>=c.start);
for(const mobile of [false,true]){
  const sample=p=>sampleStageTypography(chapterAt(p),p,{mobile});
  const forward=progress.map(sample);
  assert.deepEqual(progress.toReversed().map(sample).toReversed(),forward);
  for(const i of [1357,2000,0,880,200,1979,37])assert.deepEqual(sample(progress[i]),forward[i]);
  for(const chapter of DENTAL_CHAPTERS){
    const settled=sample(chapter.at);
    assert.equal(settled.opacity,1);assert.equal(settled.shift,0);
    assert.ok(settled.x>=0&&settled.x+settled.width<=1&&settled.y>=0&&settled.y<1&&settled.font>=20);
    for(const p of [chapter.start,chapter.at,chapter.end]){
      const normal=sampleStageTypography(chapter,p,{mobile});
      const reduced=sampleStageTypography(chapter,p,{mobile,reducedMotion:true});
      const free=sampleStageTypography(chapter,p,{mobile,free:true});
      assert.equal(reduced.opacity,1);assert.equal(reduced.shift,0);
      assert.ok(free.opacity<=normal.opacity&&free.opacity>=0);
      assert.equal(free.x,normal.x);assert.equal(free.width,normal.width);
    }
  }
  for(let i=1;i<DENTAL_CHAPTERS.length;i++){
    const previous=DENTAL_CHAPTERS[i-1],next=DENTAL_CHAPTERS[i],p=next.start;
    assert.equal(previous.end,p);
    assert.equal(sampleStageTypography(previous,p,{mobile}).opacity,0);
    assert.equal(sampleStageTypography(next,p,{mobile}).opacity,0);
    const out=sample(p-.002),into=sample(p+.004);
    assert.ok(out.opacity>0&&out.opacity<1&&into.opacity>0&&into.opacity<1);
  }
}
console.log('Stage typography: seven exact titles, six two-sided boundaries, deterministic reverse/jumps and reduced motion passed on both profiles.');
