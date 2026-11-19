import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DENTAL_CHAPTERS, STORY_TIMING } from '../src/experience/story-config.js';

export async function recordMolarTransition(page, output, ffmpeg) {
  const site = id => DENTAL_CHAPTERS.find(chapter => chapter.id === id).at;
  const beats = [
    { seconds: .65, at: site('hero') }, { seconds: 3, at: site('anatomy') },
    { seconds: .8, at: site('anatomy') }, { seconds: 4.3, at: site('plaque') },
    { seconds: .65, at: site('plaque') }, { seconds: 4.3, at: STORY_TIMING.resultAt },
    { seconds: .8, at: STORY_TIMING.resultAt },
  ];
  return recordBrowserInteraction(page, output, ffmpeg, () => page.evaluate(async beats => {
    const story = document.querySelector('#dental-journey').getBoundingClientRect();
    const top = scrollY + story.top, span = story.height - document.querySelector('#journey-stage').clientHeight;
    let from = beats[0].at;
    for (const { seconds, at } of beats) {
      const start = performance.now();
      let t = 0;
      while (t < 1) {
        const now = await new Promise(requestAnimationFrame);
        t = Math.min(1, (now - start) / (seconds * 1000));
        const progress = from + (at - from) * t * t * (3 - 2 * t);
        scrollTo({ top: top + span * progress, behavior: 'instant' });
      }
      from = at;
    }
  }, beats));
}

// Preserve the actual browser compositor timestamps so that a slow WebGL
// frame remains visible in the recording.
export async function recordBrowserInteraction(page, output, ffmpeg, interact) {
  const { width, height } = page.viewportSize();
  const cdp = await page.context().newCDPSession(page);
  const first = await page.screenshot({ type: 'jpeg', quality: 94, scale: 'css' });
  const frames = [{ time: Date.now() / 1000, data: first }];
  cdp.on('Page.screencastFrame', ({ metadata, data, sessionId }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (metadata.timestamp > frames.at(-1).time) {
      frames.push({ time: metadata.timestamp, data: Buffer.from(data, 'base64') });
    }
  });
  try {
    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 94, maxWidth: width, maxHeight: height, everyNthFrame: 1,
    });
    await interact();
    await cdp.send('Page.stopScreencast');
  } finally {
    await cdp.detach();
  }
  const end = Date.now() / 1000;
  assert.ok(frames.length > 120, 'Capture must contain a moving sequence');
  const dir = await mkdtemp(join(tmpdir(), 'zub-molar-film-')), files = [];
  const manifest = ['ffconcat version 1.0'];
  try {
    for (const [i, frame] of frames.entries()) {
      const name = 'frame-' + i + '.jpg';
      await writeFile(join(dir, name), frame.data);
      files.push(name);
      manifest.push('file ' + name, 'option framerate 1000',
        'duration ' + Math.max(.001, (frames[i + 1]?.time ?? end) - frame.time).toFixed(6));
    }
    manifest.push('file ' + files.at(-1), 'option framerate 1000');
    await writeFile(join(dir, 'take.ffconcat'), manifest.join('\n'));
    files.push('take.ffconcat');
    await promisify(execFile)(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'take.ffconcat',
      '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17',
      '-movflags', '+faststart', '-an', resolve(output),
    ], { cwd: dir, windowsHide: true });
    console.log(frames.length + ' real compositor frames in ' + (end - frames[0].time).toFixed(2) + ' s.');
  } finally {
    for (const name of files) await unlink(join(dir, name));
    await rmdir(dir);
  }
}
