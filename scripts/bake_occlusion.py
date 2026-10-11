"""Bake short-range geometry AO into R; existing roughness stays in G.

Run in Blender after professional_model.py --prepare, before its GLB export.
Only the actual combined exterior occludes the bake, not the internal tissues.
"""
from pathlib import Path
import hashlib
import json
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/source/professional'


def bake():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    data = np.load(DEST / 'layers-high.npz')
    p = data['Enamel_p']; f = data['Enamel_f']; uv = data['Enamel_uv']
    half = len(p) // 2
    # Ignore inner enamel and the artificial cervical bridge.
    f = f[np.all(f < half, axis=1)]
    points = np.vstack((p[:half], data['Cementum_p'])) / 1000
    faces = np.vstack((f, data['Cementum_f'] + half))
    coords = np.vstack((uv[:half], data['Cementum_uv']))
    points = points[:, [0, 2, 1]]; points[:, 1] *= -1
    coords[:, 1] = 1 - coords[:, 1]
    mesh = bpy.data.meshes.new('Only source-derived exterior')
    mesh.from_pydata(points.tolist(), [], faces.tolist()); mesh.update()
    mesh.polygons.foreach_set('use_smooth', np.ones(len(faces), bool))
    layer = mesh.uv_layers.new(name='Dundee native UV')
    layer.data.foreach_set('uv', coords[faces.reshape(-1)].reshape(-1))
    obj = bpy.data.objects.new('Exterior AO bake', mesh)
    bpy.context.collection.objects.link(obj)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    mat = bpy.data.materials.new('Short range actual surface visibility')
    mat.use_nodes = True; mesh.materials.append(mat)
    nodes = mat.node_tree.nodes; links = mat.node_tree.links; nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value = 0.00065
    ao.samples = 32; ao.only_local = True
    links.new(ao.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs[0], output.inputs['Surface'])
    image = bpy.data.images.new('Geometry AO 650 micrometres', 2048, 2048, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1, 1, 1, 1)
    target = nodes.new('ShaderNodeTexImage'); target.image = image
    nodes.active = target; target.select = True
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for device in prefs.devices: device.use = device.type == 'OPTIX'
        scene.cycles.device = 'GPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.render.bake.margin = 12
    scene.render.bake.use_clear = False
    bpy.ops.object.bake(type='EMIT')
    count = 2048 * 2048 * 4
    values = np.empty(count, np.float32); image.pixels.foreach_get(values)
    values = values.reshape(-1, 4)
    # Modest strength avoids stamping heavy dark AO into healthy fissures.
    occlusion = np.clip(0.35 + 0.65 * values[:, 0], 0, 1)
    for name in ('enamel-roughness.png', 'cementum-roughness.png'):
        source = bpy.data.images.load(str(DEST / name), check_existing=False)
        source.colorspace_settings.name = 'Non-Color'
        assert tuple(source.size) == (2048, 2048)
        pixels = np.empty(count, np.float32); source.pixels.foreach_get(pixels)
        pixels = pixels.reshape(-1, 4)
        pixels[:, 0] = occlusion; pixels[:, 2] = 0
        source.pixels.foreach_set(pixels.reshape(-1)); source.update()
        source.filepath_raw = str(DEST / name); source.file_format = 'PNG'; source.save()
    (DEST / 'occlusion-bake.json').write_text(json.dumps({
        'method': 'Blender Cycles Ambient Occlusion node, emission bake',
        'blender': bpy.app.version_string, 'device': scene.cycles.device,
        'resolution': 2048, 'samples': 32, 'node_samples': 32,
        'radius_metres': 0.00065, 'bake_margin_pixels': 12,
        'occluder': 'Combined Enamel exterior plus Cementum; internal tissues and cervical bridge excluded',
        'source_npz_sha256': hashlib.sha256((DEST / 'layers-high.npz').read_bytes()).hexdigest(),
        'channel': 'R of shared occlusion/roughness texture; roughness unchanged in G; B=0',
        'strength_remap': '0.35 + 0.65 * measured surface visibility',
        'note': 'Local geometric ambient occlusion, not measured stains or subsurface scattering',
    }, indent=2) + '\n', encoding='utf8')
    print('Packed AO finished', DEST, flush=True)


if __name__ == '__main__':
    bake()
