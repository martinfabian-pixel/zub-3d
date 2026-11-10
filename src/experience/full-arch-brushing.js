import {
  Box3, Color, CylinderGeometry, ExtrudeGeometry, Group, InstancedMesh, LatheGeometry,
  MathUtils, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion,
  Shape, Vector2, Vector3,
} from 'three';

const { clamp, lerp, smootherstep } = MathUtils;
const up = new Vector3(0, 1, 0);
const localBristle = new Vector3(0, 0, 1);
const localAcross = new Vector3(1, 0, 0);
const axis = new Vector3(0, 1, 0);
const openBite = 1.5;
const bristleLength = .58;
const samples = 26;
const changeTime = 1.42;
const steps = [
  { phase: 'upper', teeth: [22, 23, 24], yaw: [.32, .54], pitch: .13, duration: 3.1, opening: 0, angle: 45 },
  { phase: 'lower', teeth: [42, 43, 44], yaw: [-.32, -.57], pitch: .15, duration: 3.1, opening: 0, angle: 45 },
  { phase: 'chewing', teeth: [35, 36, 37], yaw: [.76, .91], pitch: .61, duration: 3.2, opening: openBite, angle: null },
  { phase: 'inner', teeth: [31], yaw: [2.35, 2.35], pitch: .48, duration: 2.6, opening: openBite, angle: null },
];

function roundedHead(width, length, radius) {
  const x = width / 2, y = length / 2;
  const shape = new Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return shape;
}

function createToothbrush() {
  const object = new Group();
  object.name = 'Soft manual toothbrush';
  object.visible = false;
  const polymer = new MeshPhysicalMaterial({
    color: '#20657b', roughness: .34, clearcoat: .29, clearcoatRoughness: .48,
  });
  const inlay = new MeshStandardMaterial({ color: '#d7eef0', roughness: .48 });
  const nylon = new MeshPhysicalMaterial({ color: '#ffffff', roughness: .52, specularIntensity: .43 });
  const materials = [polymer, inlay, nylon];
  const geometries = [];
  function part(name, geometry, material) {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    object.add(mesh);
    return mesh;
  }

  const profile = [[0, -7.35], [.15, -7.32], [.23, -7.22], [.28, -7.02], [.30, -6.48],
    [.29, -5.94], [.255, -5.40], [.233, -4.50], [.208, -3.60], [.174, -2.82],
    [.135, -2.10], [.105, -1.32], [.122, -.82], [0, -.82]];
  const grip = part('Rounded turquoise handle', new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 20), polymer);
  grip.position.z = -.19;
  grip.scale.z = .72;
  const head = part('Rounded brush head', new ExtrudeGeometry(roundedHead(.64, 1.76, .25), {
    depth: .18, bevelEnabled: true, bevelSegments: 2, bevelSize: .045, bevelThickness: .04, curveSegments: 5,
  }), polymer);
  head.position.z = -.23;
  const pad = part('Soft tuft bed', new ExtrudeGeometry(roundedHead(.55, 1.59, .22), {
    depth: .016, bevelEnabled: false, curveSegments: 5,
  }), inlay);
  pad.position.z = -.034;

  const filamentGeometry = new CylinderGeometry(.71, 1, 1, 5, 1);
  geometries.push(filamentGeometry);
  const clusters = [];
  for (let row = 0; row < 9; row++) {
    for (let column = 0; column < 4; column++) {
      if ((row === 0 || row === 8) && (column === 0 || column === 3)) continue;
      clusters.push({ x: (column - 1.5) * .135, y: (row - 4) * .17, color: row < 2 || row > 6 ? '#8fb5b9' : '#f1f4f1' });
    }
  }
  const filaments = new InstancedMesh(filamentGeometry, nylon, clusters.length * 7);
  filaments.name = 'Soft rounded nylon bristles';
  const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), tilt = new Quaternion();
  tilt.setFromUnitVectors(axis, localBristle);
  const tone = new Color();
  let index = 0;
  for (const { x, y, color } of clusters) {
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI / 3;
      const radius = i ? .027 : 0;
      const length = bristleLength - .025 * (1 + Math.cos(index * 2.41));
      position.set(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, length / 2 - .018);
      scale.set(.015, length, .015);
      filaments.setMatrixAt(index, matrix.compose(position, tilt, scale));
      filaments.setColorAt(index++, tone.set(color).multiplyScalar(.92 + .08 * Math.abs(Math.sin(index))));
    }
  }
  filaments.instanceMatrix.needsUpdate = true;
  filaments.instanceColor.needsUpdate = true;
  filaments.computeBoundingSphere();
  object.add(filaments);
  return { object, dispose() {
    object.removeFromParent();
    filaments.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
}

// Smile seating is in centimetres. Read the actual indexed crown assets once
// and hold a small vertex cloud so playback doesn't raycast the full arch.
function measureCrowns(arch) {
  arch.object.updateWorldMatrix(true, true);
  const crowns = new Map(), point = new Vector3();
  for (const [fdi, item] of arch.teeth) {
    const mesh = item.crown;
    if (!mesh) continue;
    const positions = mesh.geometry.getAttribute('position');
    const box = new Box3();
    const vertices = new Float32Array(3 * Math.ceil(positions.count / 3));
    for (let i = 0, j = 0; i < positions.count; i += 3, j += 3) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(point);
      point.toArray(vertices, j);
    }
    const outward = localBristle.clone().transformDirection(mesh.matrixWorld);
    outward.y = 0;
    crowns.set(fdi, { vertices, box, upper: item.upper,
      center: box.getCenter(new Vector3()), outward: outward.normalize() });
  }
  return crowns;
}

function rowOffset(upper, amount) { return amount * (upper ? .62 : -.38); }

// The plate of the toothbrush stays outside the support surface. Select
// vertices beneath its footprint in the tilted local brush frame, including
// adjacent crowns. Bristle tips meet the most prominent part of that surface.
function support(crowns, center, across, along, outward, opening, lowerOnly = false, transition = false) {
  let max = -Infinity;
  for (const crown of crowns.values()) {
    if (lowerOnly && crown.upper) continue;
    const yOffset = rowOffset(crown.upper, opening);
    const cx = crown.center.x - center.x, cy = crown.center.y + yOffset - center.y, cz = crown.center.z - center.z;
    const side = cx * across.x + cy * across.y + cz * across.z;
    const length = cx * along.x + cy * along.y + cz * along.z;
    if (Math.abs(side) > 1.4 || length > 1.85 || length < -8.35) continue;
    const points = crown.vertices;
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i] - center.x, y = points[i + 1] + yOffset - center.y, z = points[i + 2] - center.z;
      const acrossHead = Math.abs(x * across.x + y * across.y + z * across.z);
      const alongHead = x * along.x + y * along.y + z * along.z;
      if (acrossHead > .37 || alongHead > .93 || alongHead < -7.38) continue;
      const depth = x * outward.x + y * outward.y + z * outward.z;
      if (depth < -1.35 || depth > (transition ? .55 : 1.65)) continue;
      const bristled = acrossHead <= .26 && Math.abs(alongHead) <= .74;
      max = Math.max(max, depth + (bristled ? bristleLength : .025));
    }
  }
  return max;
}

function makeKey(crowns, step, t) {
  const { phase, teeth, opening } = step;
  const s = t * (teeth.length - 1);
  const first = crowns.get(teeth[Math.floor(s)]);
  const last = crowns.get(teeth[Math.ceil(s)]);
  const fraction = s % 1;
  const contact = first.center.clone().lerp(last.center, fraction);
  contact.y += rowOffset(first.upper, opening);
  const radial = first.outward.clone().lerp(last.outward, fraction).normalize();
  const bristle = radial.clone().negate();
  let handle;
  if (phase === 'upper' || phase === 'lower') {
    const sign = phase === 'upper' ? 1 : -1;
    const neck = lerp(first.box.max.y - first.box.min.y, last.box.max.y - last.box.min.y, fraction);
    contact.y += sign * neck * .18;
    bristle.y = sign; // Equal horizontal and vertical components give 45°.
    handle = new Vector3(radial.z, 0, -radial.x).multiplyScalar(-sign);
  } else if (phase === 'chewing') {
    contact.y = lerp(first.box.max.y, last.box.max.y, fraction) + rowOffset(false, opening);
    bristle.set(0, -1, 0);
    // Extend the handle forward and outward, clear of the opened bite.
    handle = radial.clone().add(new Vector3(0, 0, .52));
  } else {
    // Front lingual surfaces are approached with the handle upright.
    bristle.copy(radial);
    handle = up.clone();
    contact.y += lerp(-.17, .22, t);
  }
  bristle.normalize();
  const along = handle.addScaledVector(bristle, -handle.dot(bristle)).normalize().negate();
  const across = new Vector3().crossVectors(along, bristle);
  const outward = bristle.clone().negate();
  // The separated upper row sits beyond the back of the lower chewing pose.
  // Only the lower row defines the bristle support plane for that view.
  const depth = Math.max(bristleLength, support(crowns, contact, across, along, outward, opening, phase === 'chewing'));
  const position = contact.clone().addScaledVector(outward, depth + .008);
  const focus = contact.clone().addScaledVector(outward, (depth - bristleLength) * .6);
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across, along, bristle));
  return { position, rotation, outward, focus };
}

function ease(value) { return smootherstep(value, 0, 1); }

// An illustrative sequence sampled by the existing scene clock. It keeps the
// brush's axial roll tied to tooth surfaces instead of spinning the head.
export function createFullArchBrushing({ arch }) {
  const brush = createToothbrush();
  const result = { active: false, phase: 'upper', done: false, angleDegrees: 45,
    viewYaw: .32, viewPitch: .13, focus: new Vector3(), jawOpening: 0 };
  const point = new Vector3(), rotation = new Quaternion(), focus = new Vector3(), outward = new Vector3();
  const lastPoint = new Vector3(), lastRotation = new Quaternion(), lastFocus = new Vector3(), lastOutward = new Vector3();
  const shift = new Vector3(), across = new Vector3(), along = new Vector3(), away = new Vector3();
  let crowns, frames, exchange, index = 0, time = 0, reduced = false;

  function apply(index, t, position, rotation, focus, normal) {
    const values = frames[index];
    const at = clamp(t, 0, 1) * samples;
    const a = values[Math.floor(at)], b = values[Math.ceil(at)], mix = at % 1;
    position.lerpVectors(a.position, b.position, mix);
    rotation.slerpQuaternions(a.rotation, b.rotation, mix);
    focus.lerpVectors(a.focus, b.focus, mix);
    normal.lerpVectors(a.outward, b.outward, mix).normalize();
  }

  function stroke(t, inner) {
    if (inner) return .5 - .46 * Math.cos(4 * Math.PI * t);
    // Each motion reverses locally before the brush advances to the next
    // crown. Peak-to-peak travel stays shorter than a tooth's width.
    return .10 + .80 * ease(t) + .075 * Math.sin(t * Math.PI * 10);
  }

  function outsideMouth(position, normal, phase) {
    if (phase === 'inner') return position.clone().setZ(-4.6);
    if (phase === 'chewing') return position.clone().setX(4.55);
    const outward = normal.clone().setY(0).normalize();
    return position.clone().addScaledVector(outward, 1.64);
  }

  function buildExchange(from) {
    const step = steps[index], track = stroke(0, step.phase === 'inner');
    apply(index, track, point, rotation, focus, outward);
    const exit = outsideMouth(from.point, from.outward, from.phase);
    const entry = outsideMouth(point, outward, step.phase);
    const corner = step.phase === 'inner'
      ? new Vector3(exit.x + .38, lerp(exit.y, entry.y, .5), entry.z)
      : new Vector3(step.phase === 'chewing' ? entry.x : 0, lerp(exit.y, entry.y, .5),
        Math.max(exit.z, entry.z) + (step.phase === 'chewing' ? 2.7 : 1.4));
    const positions = [], clearances = [];
    for (let i = 0; i <= samples; i++) {
      const time = i / samples, amount = ease(time), lift = Math.sin(Math.PI * amount);
      const turn = ease((time - .25) / .5);
      const next = new Vector3();
      if (time < .25) next.lerpVectors(from.point, exit, ease(time / .25));
      else if (time > .75) next.lerpVectors(entry, point, ease((time - .75) / .25));
      else {
        shift.lerpVectors(exit, corner, turn);
        next.lerpVectors(corner, entry, turn).lerp(shift, 1 - turn);
      }
      const q = from.rotation.clone().slerp(rotation, turn);
      across.copy(localAcross).applyQuaternion(q);
      along.copy(axis).applyQuaternion(q);
      away.copy(localBristle).applyQuaternion(q).negate();
      const opening = lerp(from.opening, step.opening, amount);
      const clearance = i === 0 || i === samples ? 0 :
        Math.max(0, support(crowns, next, across, along, away, opening, false, true) + .008 + .1 * lift);
      positions.push({ point: next, away: away.clone() });
      clearances.push(clearance);
    }
    // Broaden the clearance either side of a protruding surface, so the
    // interpolated path also leaves room between its measured samples.
    const path = positions.map(({ point, away }, i) => point.addScaledVector(away, Math.max(clearances[i],
      (clearances[i - 1] ?? 0) * .72, (clearances[i + 1] ?? 0) * .72)));
    path[0].copy(from.point);
    path.at(-1).copy(point);
    return { ...from, path };
  }

  function fromPrevious() {
    const previous = steps[index - 1], track = stroke(1, previous.phase === 'inner');
    apply(index - 1, track, lastPoint, lastRotation, lastFocus, lastOutward);
    return {
      point: lastPoint.clone(), rotation: lastRotation.clone(), focus: lastFocus.clone(), outward: lastOutward.clone(),
      phase: previous.phase, yaw: lerp(...previous.yaw, track), pitch: previous.pitch, opening: previous.opening,
    };
  }

  function update(deltaSeconds, { reducedMotion = false } = {}) {
    if (!result.active) return result;
    reduced = reducedMotion;
    if (!reduced && !result.done) {
      time += clamp(deltaSeconds, 0, .1);
      const end = steps[index].duration + (index ? changeTime : 0);
      if (time >= end) {
        if (index === steps.length - 1) { time = end; result.done = true; }
        else { time -= end; index++; exchange = buildExchange(fromPrevious()); }
      }
    }
    const step = steps[index], currentChange = index ? changeTime : 0;
    const transition = !reduced && currentChange && time < currentChange;
    const t = reduced ? .5 : clamp((time - currentChange) / step.duration, 0, 1);
    const track = stroke(t, step.phase === 'inner');
    apply(index, track, point, rotation, focus, outward);
    result.phase = step.phase;
    result.angleDegrees = step.angle;
    result.viewYaw = lerp(...step.yaw, track);
    result.viewPitch = step.pitch;
    result.jawOpening = step.opening;
    result.focus.copy(focus);
    if (transition) {
      // Move out of contact first. During the change of face, the brush rolls
      // in space and never pivots on the teeth as though it were a drill.
      const clock = time / currentChange, amount = ease(clock), key = clock * samples;
      point.lerpVectors(exchange.path[Math.floor(key)], exchange.path[Math.ceil(key)], key % 1);
      rotation.slerp(exchange.rotation, 1 - ease((clock - .25) / .5));
      result.viewYaw = lerp(exchange.yaw, result.viewYaw, amount);
      result.viewPitch = lerp(exchange.pitch, step.pitch, amount);
      result.jawOpening = lerp(exchange.opening, step.opening, amount);
      result.focus.lerp(exchange.focus, 1 - amount);
    } else if (!reduced && index === 0 && t < .15) {
      point.addScaledVector(outward, .82 * (1 - ease(t / .15)));
    }
    brush.object.position.copy(point);
    brush.object.quaternion.copy(rotation);
    return result;
  }

  return {
    object: brush.object,
    start() {
      crowns = measureCrowns(arch);
      if (!steps.every(step => step.teeth.every(fdi => crowns.has(fdi)))) return false;
      frames = steps.map(step => Array.from({ length: samples + 1 }, (_, i) => makeKey(crowns, step, i / samples)));
      index = 0; time = 0; exchange = null; result.active = true; result.done = false;
      brush.object.visible = true;
      update(0, { reducedMotion: reduced });
      return true;
    },
    update,
    next() {
      if (!result.active || index === steps.length - 1) return false;
      index++; time = 0;
      if (!reduced) exchange = buildExchange({
        point: brush.object.position.clone(), rotation: brush.object.quaternion.clone(),
        focus: result.focus.clone(), outward: localBristle.clone().applyQuaternion(brush.object.quaternion).negate(),
        phase: result.phase, yaw: result.viewYaw, pitch: result.viewPitch, opening: result.jawOpening,
      });
      result.done = reduced && index === steps.length - 1;
      return true;
    },
    stop() { result.active = false; result.done = false; brush.object.visible = false; frames = crowns = exchange = null; },
    dispose: brush.dispose,
  };
}
