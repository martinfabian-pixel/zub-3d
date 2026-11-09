"""Generate closed, stylized crowns from the locally attributed Dundee GLBs.

Run from the repository root with Blender 4.5 in background mode. The
cervical rings are estimated authoring landmarks, not clinical measurements.
"""
import bpy, bmesh, json
from pathlib import Path
root=Path.cwd()
manifest=json.loads((root/'public/dentition-assets/manifest.json').read_text())
sources={}
for tooth in manifest['teeth']:
    sources.setdefault(tooth['source'],tooth)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for file in ['dentition-assets/dentition.glb','prototype-assets/molar.glb']:
    old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(root/'public'/file),merge_vertices=True)
    added=set(bpy.data.objects)-old
    meshes=[o for o in added if o.type=='MESH']
    if file.endswith('molar.glb'): meshes[0].name='FDI_26'
    print('IMPORTED',file,[(o.name,len(o.data.vertices)) for o in meshes],flush=True)
for number,tooth in sources.items():
    obj=bpy.data.objects.get('FDI_'+str(number))
    if not obj:
        raise RuntimeError('Missing source tooth '+str(number))
    ring=tooth['cervicalRing']
    height=sum(p[1] for p in ring)/len(ring)
    bm=bmesh.new();bm.from_mesh(obj.data)
    geom=list(bm.verts)+list(bm.edges)+list(bm.faces)
    res=bmesh.ops.bisect_plane(bm,geom=geom,dist=1e-7,plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
    edges=[e for e in res['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    print('CUT',number,'h',height,'edges',len(edges),flush=True)
    if not edges:
        raise RuntimeError('Missing cervical boundary '+str(number))
    if edges:
        cap=bmesh.ops.holes_fill(bm,edges=edges,sides=0)
        print('CAP',number,len(cap['faces']),flush=True)
        rounded=bmesh.ops.poke(bm,faces=cap['faces'],offset=0.00025,center_mode='MEAN_WEIGHTED')
        uv_layer=bm.loops.layers.uv.active
        apex=max(bm.verts,key=lambda vertex:vertex.co.z)
        apex_loop=next((loop for face in apex.link_faces for loop in face.loops if loop.vert==apex),None)
        sample_uv=apex_loop[uv_layer].uv.copy() if uv_layer and apex_loop else None
        for face in rounded['faces']:
            face.smooth=True
            if sample_uv is not None:
                for loop in face.loops:
                    loop[uv_layer].uv=(sample_uv.x+loop.vert.co.x*.01,sample_uv.y+loop.vert.co.y*.01)
    boundary_count=sum(edge.is_boundary for edge in bm.edges)
    print('BOUNDARY',number,boundary_count,flush=True)
    if boundary_count:
        raise RuntimeError('Unclosed crown '+str(number))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.export_scene.gltf(filepath=str(root/'public/dentition-assets/crowns.glb'),export_format='GLB',export_materials='EXPORT',export_tangents=True)
