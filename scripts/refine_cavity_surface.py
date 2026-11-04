"""Conforming local midpoint refinement for the illustrative FDI36 lesion.

The unchanged native vertex prefix and a short edge/face recipe reconstruct
the healthy surface on the web. No vertices move out of their original faces.
"""
import numpy as np


def split_triangle(vertices, mids):
    """Split only marked edges; preserve winding in the transition ring."""
    count = sum(i >= 0 for i in mids)
    if count == 3:
        a, b, c = vertices
        ab, bc, ca = mids
        return [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
    start = next(i for i in range(3) if mids[i] >= 0 and (count == 1 or mids[(i+1)%3] >= 0))
    a, b, c = (vertices[(start+j)%3] for j in range(3))
    ab, bc = mids[start], mids[(start+1)%3]
    if count == 1:
        return [(a, ab, c), (ab, b, c)]
    return [(ab, b, bc), (a, ab, c), (ab, bc, c)]


def extend(values, recipe, normalize=False):
    """Reproduce Float32 midpoint interpolation, also used by the clay review."""
    source_count = len(values)
    edges = np.asarray(recipe['edgeMidpoints']).reshape(-1, 2)
    result = np.empty((source_count+len(edges), values.shape[1]), dtype=np.float32)
    result[:source_count] = values
    for i, (a, b) in enumerate(edges, source_count):
        value = (result[a].astype(float)+result[b])*.5
        if normalize:
            value /= np.linalg.norm(value)
        result[i] = value
    return result.astype(float)


def faces_after_refinement(original, recipe):
    return np.vstack((np.delete(original, recipe['replacedFaces'], axis=0),
                      np.asarray(recipe['triangles']).reshape(-1, 3)))


def refine_patch(g, site, normalize):
    f = g['f'].copy()
    source_faces = np.arange(len(f))
    p = g['p'].astype(np.float32)
    center = np.array(site['anchor36']['worldCm']) * 10
    basis = site['basisWorld']
    r = (g['worldMm'][f]).mean(axis=1)-center
    x = r @ basis['buccalLingualTangentBuccalPositive']
    y = r @ basis['occlusalGingivalTangentOcclusalPositive']
    z = r @ basis['outwardNormal']
    core = ((x/2.04)**2+(y/1.38)**2 < 1) & (abs(z) < .9)
    added, replaced = [], set()
    for _ in range(2):
        # Select by welded geometric edge so UV seam twins agree on splitting.
        # Each twin receives its own midpoint and retains its own UV and normal.
        _, weld = np.unique(p, axis=0, return_inverse=True)
        edges = f[:, [[0, 1], [1, 2], [2, 0]]]
        geo = np.sort(weld[edges], axis=2)
        key = geo[:, :, 0].astype(np.int64)*len(p)+geo[:, :, 1]
        wanted = np.isin(key, np.unique(key[core[source_faces]]))
        changed = wanted.any(axis=1)
        marked_edges, inv = np.unique(np.sort(edges[wanted], axis=1), axis=0, return_inverse=True)
        mids = np.full(wanted.shape, -1, dtype=int)
        mids[wanted] = len(p)+inv
        added.extend(marked_edges.tolist())
        p = np.vstack((p, (p[marked_edges[:, 0]].astype(float)*.5+p[marked_edges[:, 1]]*.5).astype(np.float32)))
        new_f, parents = [], []
        for row in np.flatnonzero(changed):
            children = split_triangle(f[row], mids[row])
            new_f.extend(children)
            parents.extend([source_faces[row]]*len(children))
        replaced.update(source_faces[changed])
        f = np.vstack((f[~changed], new_f))
        source_faces = np.concatenate((source_faces[~changed], parents))
    replaced = sorted(map(int, replaced))
    children = np.isin(source_faces, replaced)
    recipe = {'sourceVertexCount':len(g['p']), 'sourceTriangleCount':len(g['f']),
              'edgeMidpoints':np.asarray(added).ravel().tolist(), 'replacedFaces':replaced,
              'triangles':f[children].ravel().tolist(), 'parentFaces':source_faces[children].tolist()}
    n = extend(g['n'],recipe,normalize=True)
    p = p.astype(float)
    matrix = g['M']
    return {**g,'p':p,'n':n,'uv':extend(g['uv'],recipe),
            'f':faces_after_refinement(g['f'],recipe),
            'worldMm':(p@matrix[:3,:3].T+matrix[:3,3])*10,
            'worldN':normalize(n@np.linalg.inv(matrix[:3,:3]))}, recipe
