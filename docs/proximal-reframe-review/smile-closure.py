"""Blender CPU audit of the final vertical maxillary motion with the mature FDI36 cavity.

Run from the checkout with Blender --background --factory-startup --python-exit-code 1
--python docs/proximal-reframe-review/smile-closure.py. Node reads the actual JS config.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PUBLIC = ROOT / 'public'
sys.path.insert(0, str(ROOT / 'scripts'))
import prepare_dentition as dental


def read_json(path):
    return json.loads(path.read_bytes())


def package(path, hashes):
    hashes[path.relative_to(PUBLIC).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    doc, binary = dental.glb(path)
    meshes = {}
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        assert not {'matrix', 'translation', 'rotation', 'scale'}.intersection(node)
        primitive, = doc['meshes'][node['mesh']]['primitives']
        points = dental.accessor(doc, binary, primitive['attributes']['POSITION'])
        faces = dental.accessor(doc, binary, primitive['indices']).reshape(-1, 3)
        meshes[node['name']] = points, faces.astype(np.int32)
    return meshes


def bvh(points, faces):
    return BVHTree.FromPolygons(points.tolist(), faces.tolist(), all_triangles=True, epsilon=0)


def swept_boundary(points, faces, delta):
    # The end caps and two triangles per swept edge bound every translating
    # triangle. Test each shared edge rectangle once.
    n = len(points)
    edges = faces[:, [[0, 1], [1, 2], [2, 0]]].reshape(-1, 2)
    a, b = np.unique(np.sort(edges, axis=1), axis=0).T
    sides = [np.stack([a, b, b+n], axis=1), np.stack([a, b+n, a+n], axis=1)]
    return bvh(np.vstack((points, points+delta)), np.vstack((faces, faces+n, *sides)))


def sweep(upper, lower, travel):
    delta = np.array([0., -travel, 0.])
    pairs = 0
    candidates = 0
    lower_trees = {fdi: bvh(*mesh) for fdi, mesh in lower.items()}
    hits = []
    for fdi, (p, f) in upper.items():
        lo, hi = p.min(axis=0) + delta, p.max(axis=0)
        boundary = original = None
        for opposing, (q, _) in lower.items():
            pairs += 1
            if np.any(lo > q.max(axis=0)) or np.any(hi < q.min(axis=0)):
                continue
            candidates += 1
            if boundary is None:
                boundary = swept_boundary(p, f, delta)
                original = bvh(p, f)
            crossings = boundary.overlap(lower_trees[opposing])
            # Also catch an entire lower triangle strictly inside a single
            # swept prism: its vertices hit the original upper face along +Y.
            inside = np.flatnonzero(np.all((q >= lo) & (q <= hi), axis=1))
            covered = sum(original.ray_cast(Vector(q[j]), Vector((0, 1, 0)), travel)[0] is not None for j in inside)
            if crossings or covered:
                hits.append({'teeth': [fdi, opposing], 'triangleBoundaryPairs': len(crossings),
                             'coveredLowerVertices': covered})
    assert pairs == 196
    return {'testedOpposingPairs': pairs, 'overlappingSweptBounds': candidates, 'intersections': hits}


cfg = json.loads(subprocess.check_output([
    'node', '--input-type=module', '--eval',
    "import {experienceConfig as c} from './src/experience/config.js';"
    "process.stdout.write(JSON.stringify({anatomy:c.anatomy,assets:c.assets}))",
], cwd=ROOT))
anatomy, assets = cfg['anatomy'], cfg['assets']
damage_path = PUBLIC / 'story-assets/caries-36.json'
shape = read_json(damage_path)
manifest_path = PUBLIC / assets['manifest']
manifest = read_json(manifest_path)
hashes = {path.relative_to(PUBLIC).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
          for path in (damage_path, manifest_path)}
report = {
    'method': 'Rigid world-Y sweep. BVH intersections with end caps and swept edge rectangles of every upper face, plus inverse-translation ray tests on lower vertices. Closed full tooth surfaces, with no render mask, are used.',
    'scope': 'Final smile pose only. The lower teaching site and brush audit use the separate fixed open setup.',
    'upperOffsetCm': anatomy['upperOffset'], 'lowerOffsetCm': anatomy['lowerOffset'],
    'sweepMm': 10*anatomy['smileClosureCm'], 'range': anatomy['smileClosureRange'],
    'morph': {'tooth': shape['fdi'], 'influence': 1, 'sparseVertices': len(shape['indices']),
              'geometrySha256': shape['sourceGeometrySha256']},
    'lods': {}, 'inputSha256': hashes,
}
for label, atlas_key, upper_key, lower_key in [
    ('desktop', 'desktop', 'upperDesktop', 'heroDesktop'),
    ('mobile', 'compact', 'upperCompact', 'heroCompact'),
]:
    atlas = package(PUBLIC / assets[atlas_key], hashes)
    hero26 = package(PUBLIC / assets[upper_key], hashes)['ToothExterior']
    hero36 = package(PUBLIC / assets[lower_key], hashes)['ToothExterior']
    lower, upper = {}, {}
    for entry in manifest['teeth']:
        fdi = entry['fdi']
        source = entry['source']
        p, f = hero36 if source == 36 else hero26 if source == 26 else atlas[entry['node']]
        if fdi == 36:
            p = p.copy()
            p[shape['indices']] += np.array(shape['positionDelta'], dtype=p.dtype).reshape(-1, 3)
        matrix = np.asarray(entry['matrix']).reshape(4, 4).T
        offset = anatomy['upperOffset' if fdi < 30 else 'lowerOffset']
        placed = dental.affect(matrix, p) + offset
        (upper if fdi < 30 else lower)[fdi] = (placed, f)
    certified = sweep(upper, lower, anatomy['smileClosureCm'])
    # Known contact at a larger excursion is a positive control for the test.
    challenge = sweep(upper, lower, .64)
    assert not certified['intersections'] and any(
        hit['teeth'] == [21, 31] for hit in challenge['intersections']
    ), (label, certified, challenge)
    report['lods'][label] = {'configuredSweep': certified, 'positiveControl6.4Mm': challenge}
    print(label, certified, challenge, flush=True)

(HERE / 'smile-closure.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
