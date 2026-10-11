"""Independent, read-only layer audit. Run with Blender's bundled Python.

blender --background --factory-startup --python scripts/audit_layer_geometry.py
Optional arguments after --: --report PATH --lod high|mobile|both
Coordinates and tolerances are millimetres. BVH epsilon is exactly zero.
Pairs sharing ANY vertex after 1e-7 mm positional welding are excluded from
self-intersection counts. Consequently these counts are conservative: they
do not test folding between adjacent triangles or certify clinical anatomy.
No source, model, or diagnostic file is modified unless --report is supplied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]


def accessor(doc, blob, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
    width = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'SCALAR': 1}[a['type']]
    item = np.dtype(dtype).itemsize
    return np.ndarray((a['count'], width), dtype=dtype, buffer=blob,
        offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
        strides=(v.get('byteStride', width * item), item)).copy()


def source_surface():
    path = ROOT / 'assets/source/dundee/scene.gltf'
    doc = json.loads(path.read_text())
    blob = (path.parent / doc['buffers'][0]['uri']).read_bytes()
    primitive = doc['meshes'][0]['primitives'][0]
    p = accessor(doc, blob, primitive['attributes']['POSITION']).astype(float)
    f = accessor(doc, blob, primitive['indices']).reshape(-1, 3).astype(np.int64)

    def visit(index, parent):
        node = doc['nodes'][index]
        local = np.asarray(node.get('matrix', np.eye(4).T.ravel())).reshape(4, 4).T
        matrix = parent @ local
        if node.get('mesh') == 0:
            return matrix
        for child in node.get('children', []):
            found = visit(child, matrix)
            if found is not None:
                return found
        return None

    matrix = visit(doc['scenes'][doc.get('scene', 0)]['nodes'][0], np.eye(4))
    p = (np.column_stack((p, np.ones(len(p)))) @ matrix.T)[:, :3]
    p = p @ np.array([[0, 0, 1], [0, -1, 0], [1, 0, 0]]).T
    p = (p - (p.max(0) + p.min(0)) / 2) * (21 / np.ptp(p[:, 1]))
    return p, f, hashlib.sha256(blob).hexdigest()


def welded(p, f):
    _, first, inverse = np.unique(np.round(p, 7), axis=0,
                                  return_index=True, return_inverse=True)
    return p[first], inverse[f]


def tree(p, f):
    return BVHTree.FromPolygons(p.tolist(), f.tolist(), all_triangles=True, epsilon=0)


def percentiles(values, quantiles=(0, 1, 5, 50, 95, 99, 100)):
    return np.percentile(values, quantiles).tolist() if len(values) else []


def topology(p, f):
    p, f = welded(p, f)
    directed = np.vstack((f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]))
    edges, inverse, counts = np.unique(np.sort(directed, axis=1), axis=0,
                                      return_inverse=True, return_counts=True)
    orientation = np.where(directed[:, 0] < directed[:, 1], 1, -1)
    balance = np.bincount(inverse, weights=orientation)
    cross = np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])
    return {
        'welded_vertices': len(p), 'triangles': len(f),
        'boundary_edges': int((counts == 1).sum()),
        'nonmanifold_edges': int((counts > 2).sum()),
        'inconsistent_manifold_edges': int(((counts == 2) & (balance != 0)).sum()),
        'degenerate_faces_area_below_1e-12_mm2': int((np.linalg.norm(cross, axis=1) / 2 < 1e-12).sum()),
        'signed_volume_mm3': float(np.sum(p[f[:, 0]] * cross) / 6),
        'bounds_mm': [p.min(0).tolist(), p.max(0).tolist()],
    }


def self_intersections(p, f):
    wp, wf = welded(p, f)
    bvh = tree(wp, wf)
    pairs = np.asarray([(a, b) for a, b in bvh.overlap(bvh)
                        if a < b and not set(wf[a]).intersection(wf[b])], dtype=np.int64).reshape(-1, 2)
    details = {'nonadjacent_triangle_pairs': len(pairs), 'first_pairs': pairs[:12].tolist()}
    if len(pairs):
        involved = np.unique(pairs)
        center = p[f[involved]].mean(1)
        details.update({
            'involved_face_count': len(involved),
            'involved_face_ids': involved.tolist(),
            'face_center_bounds_mm': [center.min(0).tolist(), center.max(0).tolist()],
            'face_centers_below_y_2p7_mm': int((center[:, 1] < 2.7).sum()),
        })
    return details, pairs


def glb_dentin(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + size])
    blob = data[28 + size:]
    mesh = next(m for m in doc['meshes'] if m.get('name', '').startswith('Dentin'))
    primitive = mesh['primitives'][0]
    # Current exporter writes identity node transforms; assert this assumption.
    for node in doc.get('nodes', []):
        if node.get('name', '').startswith('Dentin'):
            assert 'matrix' not in node or np.allclose(np.asarray(node['matrix']).reshape(4, 4), np.eye(4))
            assert 'translation' not in node or np.allclose(node['translation'], 0)
            assert 'rotation' not in node or np.allclose(node['rotation'], [0, 0, 0, 1])
            assert 'scale' not in node or np.allclose(node['scale'], 1)
    return (accessor(doc, blob, primitive['attributes']['POSITION']).astype(float) * 1000,
            accessor(doc, blob, primitive['indices']).reshape(-1, 3).astype(np.int64), hashlib.sha256(data).hexdigest())


def glb_parts(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc, blob = json.loads(data[20:20 + size]), data[28 + size:]
    parts = {}
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            name = doc['materials'][primitive['material']]['name']
            p = accessor(doc, blob, primitive['attributes']['POSITION']).astype(float) * 1000
            f = accessor(doc, blob, primitive['indices']).reshape(-1, 3).astype(np.int64)
            if name in parts:
                previous_p, previous_f = parts[name]
                p, f = np.vstack((previous_p, p)), np.vstack((previous_f, f + len(previous_p)))
            parts[name] = p, f
    return parts


def audit_lod(lod, sp, sf, source_tree):
    npz_path = ROOT / 'assets/source/professional' / ('layers-' + lod + '.npz')
    d = np.load(npz_path)
    ep, ef = d['Enamel_p'], d['Enamel_f']
    rp, rf = d['Cementum_p'], d['Cementum_f']
    dp, df = d['Dentin_p'], d['Dentin_f']
    n = len(ep) // 2
    # The producer stores the outer cap first, matching inner cap second.
    outer_f = ef[np.all(ef < n, axis=1)]
    inner_f = ef[np.all(ef >= n, axis=1)] - n
    outer_p = np.vstack((ep[:n], rp))
    outer_f = np.vstack((outer_f, rf + n))
    outer_tree = tree(outer_p, outer_f)
    report = {'npz_sha256': hashlib.sha256(npz_path.read_bytes()).hexdigest()}
    for name, p, f in [('combined_outer', outer_p, outer_f), ('enamel', ep, ef), ('npz_dentin', dp, df)]:
        report[name] = topology(p, f)
        report[name]['self_intersections'], pairs = self_intersections(p, f)
        print(lod, name, 'self pairs', len(pairs), flush=True)

    # Source-linked normals inset has the original face/vertex order.
    if len(dp) == len(sp) and np.array_equal(df, sf):
        thickness = np.linalg.norm(dp - sp, axis=1)
        ids = report['npz_dentin']['self_intersections'].get('involved_face_ids', [])
        vertices = np.unique(df[ids]) if ids else []
        report['npz_dentin']['source_topology_preserved'] = True
        report['npz_dentin']['inset_mm_percentiles'] = percentiles(thickness)
        report['npz_dentin']['conflicting_vertex_inset_mm_percentiles'] = percentiles(thickness[vertices])
        report['npz_dentin']['conflicting_source_vertex_ids'] = np.asarray(vertices).tolist()

    distances, signed, root = [], [], []
    for v in outer_p:
        position, normal, _, distance = source_tree.find_nearest(Vector(v))
        distances.append(distance)
        signed.append(float(np.dot(v - np.asarray(position), np.asarray(normal))))
        if v[1] < 2.7:
            root.append(distance)
    report['outer_source_distance_mm_percentiles'] = percentiles(distances)
    report['outer_signed_source_distance_mm_percentiles'] = percentiles(signed)
    report['outer_root_below_y_2p7_distance_mm_percentiles'] = percentiles(root)

    glb_path = ROOT / 'public/models' / ('molar.glb' if lod == 'high' else 'molar-mobile.glb')
    gp, gf, digest = glb_dentin(glb_path)
    core_tree = tree(gp, gf)
    report['glb_sha256'] = digest
    report['glb_dentin'] = topology(gp, gf)
    report['glb_dentin']['self_intersections'], _ = self_intersections(gp, gf)
    report['core_vs_outer_intersection_pairs'] = len(core_tree.overlap(outer_tree))
    report['core_vs_enamel_inner_intersection_pairs'] = len(core_tree.overlap(tree(ep[n:], inner_f)))
    # Check exported enamel too: material splitting and float32 quantization
    # are independent of the otherwise unchanged authoring coordinates.
    parts = glb_parts(glb_path)
    ge, gef = parts['Enamel']
    gi, gif = parts['EnamelInner']
    enamel_p, enamel_f = np.vstack((ge, gi)), np.vstack((gef, gif + len(ge)))
    report['glb_enamel'] = topology(enamel_p, enamel_f)
    report['glb_enamel']['self_intersections'], _ = self_intersections(enamel_p, enamel_f)
    expected = np.unique(np.float32(ep / 1000), axis=0)
    exported = np.unique(np.float32(enamel_p / 1000), axis=0)
    report['glb_enamel']['matches_npz_float32_position_set'] = bool(np.array_equal(expected, exported))
    expected = np.unique(np.float32(dp / 1000), axis=0)
    exported = np.unique(np.float32(gp / 1000), axis=0)
    report['glb_dentin']['matches_npz_float32_position_set'] = bool(np.array_equal(expected, exported))
    outer_keys = {tuple(x) for x in np.float32(ep[:n] / 1000)}
    is_outer = np.asarray([tuple(x) in outer_keys for x in np.float32(ge / 1000)])
    gof = gef[np.all(is_outer[gef], axis=1)]
    gr, grf = parts['Cementum']
    exported_outer_p = np.vstack((ge, gr))
    exported_outer_f = np.vstack((gof, grf + len(ge)))
    report['glb_core_vs_glb_outer_intersection_pairs'] = len(core_tree.overlap(tree(exported_outer_p, exported_outer_f)))
    report['glb_core_vs_glb_enamel_inner_intersection_pairs'] = len(core_tree.overlap(tree(gi, gif)))
    if len(gp) == len(dp) and np.array_equal(gf, df):
        _, inverse, counts = np.unique(np.round(dp, 7), axis=0, return_inverse=True, return_counts=True)
        gaps = []
        for group in np.flatnonzero(counts > 1):
            q = gp[inverse == group]
            gaps.append(float(np.linalg.norm(q[:, None] - q[None, :], axis=2).max()))
        report['glb_dentin']['original_seam_gap_mm_percentiles'] = percentiles(gaps)
    print(lod, 'GLB dentin boundaries', report['glb_dentin']['boundary_edges'],
          'self pairs', report['glb_dentin']['self_intersections']['nonadjacent_triangle_pairs'],
          'core/inner pairs', report['core_vs_enamel_inner_intersection_pairs'], flush=True)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path)
    parser.add_argument('--lod', choices=('high', 'mobile', 'both'), default='both')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    p, f, digest = source_surface()
    result = {'method': {'units': 'mm', 'positional_weld_decimal_places': 7, 'bvh_epsilon_mm': 0,
                         'self_intersection_exclusion': 'Any shared welded vertex; unique unordered face pairs',
                         'percentile_order': [0, 1, 5, 50, 95, 99, 100]},
              'source_bin_sha256': digest, 'source': topology(p, f)}
    result['source']['self_intersections'], _ = self_intersections(p, f)
    st = tree(p, f)
    for lod in (['high', 'mobile'] if args.lod == 'both' else [args.lod]):
        result[lod] = audit_lod(lod, p, f, st)
    if args.report:
        args.report.write_text(json.dumps(result, indent=2), encoding='utf-8')
        print('Report:', args.report.resolve(), flush=True)
    else:
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
