"""Offline Cycles review of the exported GLB, independent of the web renderer.

blender --background --factory-startup --python scripts/render_review.py -- \
  --model public/models/molar.glb --output ../professional-review/cycles
These are control renders, not screenshots of the Three.js presentation.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, location, power, size, size_y, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size_y
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0, 0, 0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--size', type=int, default=800)
    parser.add_argument('--samples', type=int, default=96)
    parser.add_argument('--clay', action='store_true')
    parser.add_argument('--views', default='front,side,back,top')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (minimum + maximum) / 2
    # Uniformly normalize to the same illustrative 21 mm height used in the app.
    scale = 0.021 / (maximum.z - minimum.z)
    root = bpy.data.objects.new('Review presentation transform', None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    root.scale = (scale,) * 3
    root.location = -center * scale
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for device in prefs.devices:
            device.use = device.type == 'OPTIX'
        scene.cycles.device = 'GPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 8
    scene.render.resolution_x = args.size
    scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new('Controlled neutral studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.65, 0.65, 0.65, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    nodes.clear()
    render = nodes.new('CompositorNodeRLayers')
    white = nodes.new('CompositorNodeAlphaOver')
    white.inputs[1].default_value = (32, 32, 32, 1)
    output = nodes.new('CompositorNodeComposite')
    scene.node_tree.links.new(render.outputs['Image'], white.inputs[2])
    scene.node_tree.links.new(white.outputs['Image'], output.inputs['Image'])
    area('Large key diffuser', (-0.035, -0.025, 0.045), 0.08, 0.040, 0.060, (1.0, 0.985, 0.95))
    area('Overhead strip', (0.005, 0.012, 0.048), 0.04, 0.030, 0.012, (1, 1, 1))
    area('Back edge', (0.030, 0.025, 0.010), 0.025, 0.018, 0.035, (1, 1, 1))
    area('Low reflector', (0.0, -0.035, -0.020), 0.01, 0.045, 0.045, (1, 0.99, 0.96))
    if args.clay:
        clay = bpy.data.materials.new('Neutral anatomy review')
        clay.diffuse_color = (0.38, 0.38, 0.38, 1)
        clay.use_nodes = True
        clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.38, 0.38, 0.38, 1)
        clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.65
        bpy.context.view_layer.material_override = clay
    camera_data = bpy.data.cameras.new('Macro 105 mm')
    camera_data.lens = 105
    camera_data.clip_start = 0.0001
    camera_data.clip_end = 2
    camera = bpy.data.objects.new('Macro review camera', camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    poses = {
        'front': (0.026, -0.065, 0.029),
        'side': (0.073, -0.007, 0.025),
        'back': (-0.026, 0.067, 0.025),
        'top': (0.0, -0.004, 0.057),
    }
    reports = []
    for view in args.views.split(','):
        camera.location = poses[view]
        look_at(camera, (0, 0, 0.002 if view == 'top' else 0))
        scene.render.filepath = str((args.output / f'{view}.png').resolve())
        bpy.ops.render.render(write_still=True)
        reports.append({'view': view, 'file': scene.render.filepath})
    (args.output / 'render-settings.json').write_text(json.dumps({
        'model': str(args.model), 'blender': bpy.app.version_string,
        'engine': scene.render.engine, 'device': scene.cycles.device,
        'samples': args.samples, 'size': args.size, 'clay': args.clay,
        'color_management': 'AgX Medium High Contrast', 'renders': reports,
        'note': 'Independent offline control renders; the interactive demo uses Three.js.',
    }, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
