// Read-only geometric/DOM evidence for the localhost full-stage browser runner.
// Call on a ready presentation-mode page with ?qa=1. Only normal scroll, focus,
// keyboard and button inputs change the view. The starting chapter is restored.
import { DENTAL_CHAPTERS, STORY_TIMING } from '../src/experience/story-config.js';
import { nativeJump, restingRaster } from './browser-camera-probes.mjs';

const captions = {
  space: 'Medzizubný priestor',
  plaque: 'Povlak',
  cleaned: 'Vyčistený povrch',
};
const chapters = {
  hero: [],
  assembly: [],
  dentition: [],
  anatomy: [],
  space: ['space'],
  plaque: ['plaque'],
  brush: [],
  result: ['cleaned'],
};
const annotationGroup = chapter => chapter === 'result' ? 'cleaned' : chapter;

/** Executed inside the page. Derives geometry from the live *render mesh*, not
 * from the overlay's claimed world/screen coordinates or a hardcoded viewport.
 * Uses a handful of scratch vectors; no geometry clones or dense world buffers.
 */
function inspectFrame(eligibleIds) {
  const app = window.__dentalExperience,
    overlay = app.annotations;
  const report = overlay.report(),
    layer = document.querySelector('#journey-annotations');
  const canvas = app.renderer.domElement,
    camera = app.rig.camera;
  const cr = canvas.getBoundingClientRect(),
    lr = layer.getBoundingClientRect();
  const vec = () => camera.position.clone().set(0, 0, 0);
  const A = vec(),
    B = vec(),
    C = vec(),
    AB = vec(),
    AC = vec(),
    P = vec(),
    Q = vec(),
    T = vec();
  const origin = camera.getWorldPosition(vec()),
    samples = [],
    bare = (s) => s.trim().replace(/\s+/g, ' ');
  const rendered = (el) => {
    if (!el || !el.getClientRects().length) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const css = getComputedStyle(p);
      if (
        p.hasAttribute('hidden') ||
        css.display === 'none' ||
        css.visibility === 'hidden' ||
        Number(css.opacity) < 0.01
      )
        return false;
    }
    return true;
  };
  const ancestorVisible = (object) => {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  const v3 = (values) => Array.isArray(values) && values.length === 3 && values.every(Number.isFinite);
  const point2 = (point) => (Array.isArray(point) ? point : [point?.x, point?.y]);
  const delta2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  function termPoint(term) {
    const fdi = Number(term.fdi),
      mesh = app.arch.teeth.get(fdi)?.mesh;
    const ids = term.vertexIndices,
      w = term.barycentric;
    if (![36, 37].includes(fdi) || !mesh || !Array.isArray(ids) || ids.length !== 3 || !v3(w))
      throw Error('Missing true triangular FDI 36/37 anchor');
    if (!ids.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.geometry.attributes.position.count))
      throw Error('Anchor vertex out of bounds');
    if (!w.every((x) => x >= -1e-5 && x <= 1.00001) || Math.abs(w.reduce((s, x) => s + x, 0) - 1) > 1e-5)
      throw Error('Invalid surface barycentrics');
    // Ensure these three IDs form a real indexed render face, not an arbitrary
    // world point synthesized by combining unrelated vertices on the tooth.
    const index = mesh.geometry.index,
      key = [...ids].sort((a, b) => a - b);
    let face = -1;
    for (let j = 0; j < index.count; j += 3) {
      const a = index.getX(j),
        b = index.getX(j + 1),
        c = index.getX(j + 2);
      if (
        Math.min(a, b, c) === key[0] &&
        Math.max(a, b, c) === key[2] &&
        a + b + c === key[0] + key[1] + key[2]
      ) {
        face = j / 3;
        break;
      }
    }
    if (face < 0) throw Error(`FDI ${fdi} anchor does not reference one indexed triangle`);
    const local = vec(), native = vec();
    for (let i = 0; i < 3; i++) {
      mesh.getVertexPosition(ids[i], A);
      local.addScaledVector(A, w[i]);
      A.fromBufferAttribute(mesh.geometry.attributes.position, ids[i]);
      native.addScaledVector(A, w[i]);
    }
    const world = local.clone().applyMatrix4(mesh.matrixWorld);
    const nativeLocalMetres = native.toArray();
    return {
      fdi,
      face,
      localMetres: local.toArray(),
      nativeLocalMetres,
      worldCm: world.toArray(),
      weight: [...w],
      sourceVertices: [...ids],
      morphWeight: mesh.morphTargetInfluences?.[0] ?? 0,
      currentDeformationMm: world.distanceTo(native.applyMatrix4(mesh.matrixWorld)) * 10,
    };
  }
  function reconstructed(anchor) {
    const terms = (anchor.terms ?? [anchor]).map(termPoint);
    const weights = anchor.weights ?? (terms.length === 1 ? [1] : []);
    if (
      weights.length !== terms.length ||
      !weights.every(Number.isFinite) ||
      Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-5
    )
      throw Error('Invalid multi-surface weights');
    const world = vec();
    terms.forEach((t, i) => world.addScaledVector(A.fromArray(t.worldCm), weights[i]));
    return { world, terms, weights };
  }
  function hitsBox(o, d, box) {
    let lo = 0,
      hi = 1;
    for (const k of ['x', 'y', 'z']) {
      if (Math.abs(d[k]) < 1e-15) {
        if (o[k] < box.min[k] || o[k] > box.max[k]) return false;
        continue;
      }
      const a = (box.min[k] - o[k]) / d[k],
        b = (box.max[k] - o[k]) / d[k];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
    return hi >= lo;
  }
  function firstToothHit(target) {
    // Möller–Trumbore in mesh-local coordinates. A ray parameter of 1 is
    // the anchor itself, so exact on-face hits never count as occlusion.
    const rayLengthMm = origin.distanceTo(target) * 10;
    let first = 1,
      firstFDI = null;
    for (const [fdi, item] of app.arch.teeth) {
      const m = item.mesh;
      if (!m || !ancestorVisible(m) || m.material?.visible === false || m.material?.opacity < 0.01) continue;
      const inv = m.matrixWorld.clone().invert(),
        o = origin.clone().applyMatrix4(inv);
      const d = target.clone().applyMatrix4(inv).sub(o),
        g = m.geometry;
      if (g.boundingBox && !hitsBox(o, d, g.boundingBox)) continue;
      const ix = g.index;
      for (let j = 0; j < ix.count; j += 3) {
        m.getVertexPosition(ix.getX(j), A);
        m.getVertexPosition(ix.getX(j + 1), B);
        m.getVertexPosition(ix.getX(j + 2), C);
        AB.subVectors(B, A);
        AC.subVectors(C, A);
        P.crossVectors(d, AC);
        const det = AB.dot(P);
        if (Math.abs(det) < 1e-20) continue;
        const invDet = 1 / det;
        T.subVectors(o, A);
        const u = T.dot(P) * invDet;
        if (u < 0 || u > 1) continue;
        Q.crossVectors(T, AB);
        const v = d.dot(Q) * invDet;
        if (v < 0 || u + v > 1) continue;
        const t = AC.dot(Q) * invDet;
        if (t > 0 && t < first) {
          first = t;
          firstFDI = fdi;
        }
      }
    }
    return { fdi: firstFDI, beforeAnchorMm: (1 - first) * rayLengthMm };
  }
  function leaderEnds(group) {
    const line = group?.querySelector('path,polyline,line');
    if (!line || !line.getScreenCTM() || typeof line.getTotalLength !== 'function') return [];
    const matrix = line.getScreenCTM();
    return [0, line.getTotalLength()].map((s) => {
      const point = line.getPointAtLength(s).matrixTransform(matrix);
      return [point.x - lr.left, point.y - lr.top];
    });
  }
  function filmSupport(term) {
    const site = app.site,
      local = vec().fromArray(term.nativeLocalMetres);
    const patch =
      term.fdi === 37 && app.profile.compact
        ? site.plaque.mobile37
        : site.plaque.patches.find((p) => p.fdi === term.fdi);
    if (!patch) return null;
    const f = patch.indices,
      p = patch.positions;
    let best = null;
    for (let i = 0; i < f.length; i += 3) {
      const a = f[i],
        b = f[i + 1],
        c = f[i + 2];
      A.fromArray(p, 3 * a);
      B.fromArray(p, 3 * b);
      C.fromArray(p, 3 * c);
      AB.subVectors(B, A);
      AC.subVectors(C, A);
      T.subVectors(local, A);
      const xx = AB.lengthSq(),
        yy = AC.lengthSq(),
        xy = AB.dot(AC),
        tx = T.dot(AB),
        ty = T.dot(AC),
        det = xx * yy - xy * xy;
      if (det <= 1e-30) continue;
      const u = (yy * tx - xy * ty) / det,
        v = (xx * ty - xy * tx) / det,
        w = 1 - u - v;
      if (Math.min(w, u, v) < -0.0001) continue;
      const gap = Q.copy(A).addScaledVector(AB, u).addScaledVector(AC, v).distanceTo(local);
      if (!best || gap < best.localGapMetres)
        best = {
          triangle: i / 3,
          localGapMetres: gap,
          edgeWeight: w * patch.edgeWeight[a] + u * patch.edgeWeight[b] + v * patch.edgeWeight[c],
        };
    }
    return best;
  }
  function physicalFeature(id, terms, world) {
    if (id === 'space') {
      const field = app.profile.compact ? 'contactsMobile' : 'contacts';
      let best = Infinity;
      for (const row of app.site.brush.centerline) {
        const walls = terms.map((t) => row[field]?.find((w) => w.fdi === t.fdi));
        if (walls.every(Boolean))
          best = Math.min(
            best,
            Math.max(
              ...terms.map(
                (t, i) => A.fromArray(t.worldCm).distanceTo(B.fromArray(walls[i].nearestWorld)) * 10,
              ),
            ),
          );
      }
      return { bilateralStationErrorMm: best };
    }
    if (id !== 'plaque' && id !== 'cleaned') return null;
    const guide = app.site.brush,
      line = guide.centerline;
    let closest = Infinity,
      arc = null;
    for (let i = 1; i < line.length; i++) {
      A.fromArray(line[i - 1].position);
      B.fromArray(line[i].position);
      AB.subVectors(B, A);
      const t = Math.max(0, Math.min(1, T.subVectors(world, A).dot(AB) / AB.lengthSq()));
      const d = Q.copy(A).addScaledVector(AB, t).distanceTo(world) * 10;
      if (d < closest) {
        closest = d;
        arc = line[i - 1].arcLengthMm + (line[i].arcLengthMm - line[i - 1].arcLengthMm) * t;
      }
    }
    return {
      film: filmSupport(terms[0]),
      wireAxisDistanceMm: closest,
      wireArcMm: arc,
      freeBristleRadiusMm: guide.dimensionsMm.bristleRadius,
      tipMaxArcMm: app.path.tipRangeMm[1],
    };
  }
  for (const label of report.labels) {
    const node = layer.querySelector(`[data-annotation-id="${CSS.escape(label.id)}"]`);
    const group = layer.querySelector(`[data-leader-for="${CSS.escape(label.id)}"]`);
    const on = rendered(node),
      leaderOn = rendered(group);
    const row = {
      id: label.id,
      text: label.text,
      domText: node ? bare(node.textContent) : null,
      reason: label.reason,
      reportVisible: !!label.visible,
      on,
      leaderOn,
      hasNode: !!node,
      hasGroup: !!group,
    };
    samples.push(row);
    if (label.anchor == null || (!on && !eligibleIds.includes(label.id))) continue;
    try {
      const { world, terms, weights } = reconstructed(label.anchor);
      const ndc = world.clone().project(camera),
        cameraZ = world.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const px = [
        ((ndc.x + 1) * cr.width) / 2 + cr.left - lr.left,
        ((1 - ndc.y) * cr.height) / 2 + cr.top - lr.top,
      ];
      const fin = [ndc.x, ndc.y, ndc.z].every(Number.isFinite),
        front = fin && cameraZ < -camera.near && cameraZ > -camera.far;
      const inCanvas = front && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
      Object.assign(row, {
        worldCm: world.toArray(),
        terms,
        weights,
        projected: px,
        cameraZ,
        inCanvas,
        worldErrorMm: v3(label.world) ? world.distanceTo(vec().fromArray(label.world)) * 10 : null,
        reportPointErrorPx: label.point ? delta2(point2(label.point), px) : null,
        physicalFeature: physicalFeature(label.id, terms, world),
      });
      if (inCanvas) row.firstHit = firstToothHit(world);
      if (on) {
        const b = node.getBoundingClientRect(),
          ends = leaderEnds(group);
        row.domRect = [b.left - lr.left, b.top - lr.top, b.width, b.height];
        row.labelInsideLayer =
          b.left >= lr.left - 1 &&
          b.top >= lr.top - 1 &&
          b.right <= lr.right + 1 &&
          b.bottom <= lr.bottom + 1;
        row.obstacleOverlaps = [
          ...layer.closest('#journey-stage').querySelectorAll('[data-annotation-obstacle]'),
        ]
          .filter(rendered)
          .filter((obstacle) => {
            const r = obstacle.getBoundingClientRect();
            return (
              Math.min(b.right, r.right) - Math.max(b.left, r.left) > 1 &&
              Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 1
            );
          })
          .map((el) => el.id || el.className || el.tagName);
        row.leaderAnchorErrorPx = ends.length ? delta2(ends[0], px) : null;
        if (ends.length) {
          const [x, y] = ends[1];
          row.leaderToLabelDistancePx = Math.hypot(
            Math.max(b.left - lr.left - x, 0, x - b.right + lr.left),
            Math.max(b.top - lr.top - y, 0, y - b.bottom + lr.top),
          );
        }
        row.reportLeaderErrorPx = label.leader?.length ? delta2(point2(label.leader[0]), px) : null;
        row.hitTest = [px, [b.left - lr.left + b.width / 2, b.top - lr.top + b.height / 2]].map(([x, y]) =>
          document.elementsFromPoint(x + lr.left, y + lr.top).some((element) => layer.contains(element)),
        );
      }
    } catch (e) {
      row.error = e.message;
    }
  }
  // Detached read-only negative control: the very same actual anchors are
  // now behind the camera. This does not touch the visible rig or overlay.
  let reverseProbe = null,
    offscreenProbe = null;
  const sample = samples.find((x) => x.on && x.worldCm);
  if (typeof overlay.probe === 'function' && sample) {
    const id = sample.id,
      back = camera.clone(),
      d = camera.getWorldDirection(vec());
    back.lookAt(origin.clone().sub(d));
    back.updateMatrixWorld(true);
    const probe = overlay.probe(id, back);
    reverseProbe = {
      id,
      reason: probe?.reason,
      behind: sample.worldCm
        ? vec().fromArray(sample.worldCm).applyMatrix4(back.matrixWorldInverse).z > 0
        : false,
    };
    // A 75-degree look-away remains in the forward hemisphere, but places
    // the same body-space anchor outside the projection. Distinguish this
    // branch from the reversed-camera case above.
    const offscreen = camera.clone(),
      surface = vec().fromArray(sample.worldCm);
    const toward = surface.clone().sub(origin).normalize();
    const right = toward.clone().cross(camera.up).normalize();
    const angle = (75 * Math.PI) / 180;
    offscreen.lookAt(
      origin.clone().addScaledVector(toward, Math.cos(angle)).addScaledVector(right, Math.sin(angle)),
    );
    offscreen.updateMatrixWorld(true);
    const ndc = surface.clone().project(offscreen);
    offscreenProbe = {
      id,
      reason: overlay.probe(id, offscreen)?.reason,
      forward: surface.clone().applyMatrix4(offscreen.matrixWorldInverse).z < -offscreen.near,
      outside: Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1,
    };
  }
  return {
    chapter: report.chapter,
    labels: samples,
    reverseProbe,
    offscreenProbe,
    decorative: layer.getAttribute('aria-hidden') === 'true',
    pointerStylesClear: [layer, ...layer.querySelectorAll('*')].every(
      (el) => getComputedStyle(el).pointerEvents === 'none',
    ),
    focusableElements: layer.querySelectorAll('button,input,a[href],[tabindex]:not([tabindex="-1"])').length,
    canvasCSS: [cr.width, cr.height],
    camera: origin.toArray(),
    cameraTarget: app.report().target,
    visibleTeeth: app.report().visibleTeeth,
  };
}

export async function auditAnnotations(page) {
  const checks = [],
    states = [];
  const check = (name, passed, detail) => checks.push({ name, passed: !!passed, detail });
  const first = await page.evaluate(() => {
    const app = window.__dentalExperience,
      r = app?.report?.();
    return {
      ready: !!(r?.assetsReady && app.annotations?.report && document.querySelector('#journey-annotations')),
      progress: r?.progress,
      free: r?.exploring,
      error: document.querySelector('canvas')?.dataset.error ?? null,
    };
  });
  check('Ready QA annotation/DOM contract', first.ready, first);
  if (!first.ready) return { passed: false, checks, states };
  check('Dedicated page starts in presentation mode', !first.free, { free: first.free });
  if (first.free) return { passed: false, checks, states };
  const read = async (chapter, name, manual = false) => {
    await restingRaster(page);
    const s = await page.evaluate(inspectFrame, chapters[chapter]);
    s.name = name;
    states.push(s);
    const allowed = chapters[chapter],
      visible = s.labels.filter((x) => x.on);
    check(
      `${name}: chapter, decorative noninteractive layer`,
      s.chapter === annotationGroup(chapter) && s.decorative && s.pointerStylesClear && !s.focusableElements,
      {
        chapter: s.chapter,
        decorative: s.decorative,
        pointerStylesClear: s.pointerStylesClear,
        focusable: s.focusableElements,
      },
    );
    check(
      `${name}: exact chapter labels and actual hidden state`,
      s.labels.every(
        (x) =>
          x.hasNode &&
          x.hasGroup &&
          x.on === x.leaderOn &&
          x.on === x.reportVisible &&
          (!x.on || (allowed.includes(x.id) && bareText(x.domText) === captions[x.id])),
      ) && visible.length <= 2,
      s.labels.map((x) => [x.id, x.on, x.reason]),
    );
    for (const x of visible) {
      check(
        `${name}/${x.id}: indexed native/morphed anchor, projection and actual SVG leader`,
        !x.error &&
          x.terms?.length &&
          x.worldErrorMm != null &&
          x.worldErrorMm <= 0.005 &&
          x.inCanvas &&
          x.reportPointErrorPx != null &&
          x.reportPointErrorPx <= 1.5 &&
          x.reportLeaderErrorPx != null &&
          x.reportLeaderErrorPx <= 2.5 &&
          x.leaderAnchorErrorPx != null &&
          x.leaderAnchorErrorPx <= 3 &&
          x.hitTest?.every((hit) => !hit),
        {
          error: x.error,
          worldErrorMm: x.worldErrorMm,
          pixelError: x.reportPointErrorPx,
          svgError: x.leaderAnchorErrorPx,
          hitTest: x.hitTest,
        },
      );
      check(
        `${name}/${x.id}: no foreground tooth blocks displayed anchor`,
        x.firstHit && x.firstHit.beforeAnchorMm < 0.035,
        x.firstHit,
      );
      check(
        `${name}/${x.id}: leader reaches its visible label without UI overlap`,
        x.leaderToLabelDistancePx != null &&
          x.leaderToLabelDistancePx <= 3 &&
          x.labelInsideLayer &&
          x.obstacleOverlaps.length === 0,
        {
          endDistancePx: x.leaderToLabelDistancePx,
          inside: x.labelInsideLayer,
          obstacles: x.obstacleOverlaps,
        },
      );
      if (x.id === 'space')
        check(
          `${name}: interproximal point uses both measured physical walls`,
          x.terms
            ?.map((t) => t.fdi)
            .sort()
            .join(',') === '36,37' &&
            x.weights?.every((w) => Math.abs(w - 0.5) < 1e-5) &&
            x.physicalFeature?.bilateralStationErrorMm <= 0.02,
          x.physicalFeature,
        );
      if (x.id === 'plaque' || x.id === 'cleaned') {
        const v = x.physicalFeature,
          film = v?.film;
        check(
          `${name}/${x.id}: registered source-film support`,
          film && film.localGapMetres <= 0.00002 && film.edgeWeight > 0.015,
          v,
        );
        if (x.id === 'cleaned')
          check(
            `${name}: cleaned location is inside measured bristle reach`,
            v &&
              v.wireAxisDistanceMm <= v.freeBristleRadiusMm + 0.005 &&
              v.wireArcMm > 0 &&
              v.wireArcMm < v.tipMaxArcMm,
            v,
          );
      }
    }
    if (visible.length === 2) {
      const [[x, y, w, h], [a, b, c, d]] = visible.map((r) => r.domRect);
      check(
        `${name}: two label boxes do not overlap`,
        x + w <= a + 1 || a + c <= x + 1 || y + h <= b + 1 || b + d <= y + 1,
        visible.map((r) => r.domRect),
      );
    }
    if (!manual && allowed.length) {
      check(
        `${name}: applicable annotations available`,
        allowed.every((id) => s.labels.some((x) => x.id === id && x.terms?.length && !x.error)),
        s.labels.filter((x) => allowed.includes(x.id)).map((x) => [x.id, x.error, x.reason]),
      );
      check(
        `${name}: at least one actual teaching label is shown`,
        visible.length > 0,
        s.labels.filter((x) => allowed.includes(x.id)).map((x) => [x.id, x.reason]),
      );
    }
    return s;
  };
  const go = async (id) => {
    const at = id === 'result' ? STORY_TIMING.resultAt : DENTAL_CHAPTERS.find((x) => x.id === id)?.at;
    if (!Number.isFinite(at)) throw Error(`Unmapped authored chapter ${id}`);
    await nativeJump(page, at);
    await page.waitForFunction((ch) => window.__dentalExperience.annotations.report().chapter === ch, annotationGroup(id), {
      timeout: 5000,
    });
  };
  try {
    for (const id of Object.keys(chapters)) {
      await go(id);
      await read(id, `guided-${id}`);
    }
    const behind = states.flatMap((s) => (s.reverseProbe ? [s.reverseProbe] : []));
    check(
      'Behind-camera negative control rejects actual anchor using detached reversed camera',
      behind.length > 0 && behind.every((p) => p.reason === 'behind-camera' && p.behind),
      behind,
    );
    const offscreen = states.flatMap((s) => (s.offscreenProbe ? [s.offscreenProbe] : []));
    check(
      'Offscreen negative control distinguishes a front-facing out-of-frame anchor',
      offscreen.length > 0 && offscreen.every((p) => p.reason === 'offscreen' && p.forward && p.outside),
      offscreen,
    );
    await go('plaque');
    const base = await read('plaque', 'orbit-start');
    // Keyboard orbit uses normal public UI, works on touch-capable test devices,
    // and does not pretend that an arbitrary screen drag always crosses a tooth.
    await page.locator('#journey-explore').click();
    await page.locator('#journey-canvas').evaluate((c) => c.focus({ preventScroll: true }));
    let observed = false;
    for (let turn = 1; turn <= 6 && !observed; turn++) {
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      const s = await read('plaque', `manual-orbit-${turn}`, true),
        label = s.labels.find((x) => x.id === 'plaque');
      observed = !!(
        label?.inCanvas &&
        label.reason === 'occluded' &&
        label.firstHit?.beforeAnchorMm > 0.05 &&
        !label.on &&
        !label.leaderOn &&
        !label.reportVisible
      );
    }
    check(
      'Real orbit hides an independently ray-occluded label and its leader',
      observed,
      states
        .filter((s) => s.name.startsWith('manual-orbit'))
        .map((s) => {
          const x = s.labels.find((x) => x.id === 'plaque');
          return { reason: x?.reason, visible: x?.on, hit: x?.firstHit, worldCm: x?.worldCm };
        }),
    );
    const last = states.at(-1);
    check(
      'Manual camera actually moved during occlusion test',
      Math.hypot(...base.camera.map((x, i) => x - last.camera[i])) > 0.01,
      { before: base.camera, after: last.camera },
    );
  } catch (e) {
    check('Annotation probe completed without exceptions', false, e.message);
  } finally {
    const explore = page.locator('#journey-explore');
    if ((await explore.getAttribute('aria-pressed')) === 'true') await explore.click();
    if (await page.locator('#journey-reset').isEnabled()) await page.locator('#journey-reset').click();
    await nativeJump(page, first.progress);
  }
  return { passed: checks.every((c) => c.passed), checks, states };
}

function bareText(s) {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}
