"""Matched Cycles geometry proof, separate from the browser material and image.
blender --background --factory-startup --python scripts/render_caries_review.py -- OUTPUT_DIR [--mature-clay-only] [--cpu]
"""
from pathlib import Path
import json,sys,numpy as np,bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'));import prepare_dentition as d
from refine_cavity_surface import extend,faces_after_refinement
DATA=ROOT/'public/story-assets';OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
site=json.loads((DATA/'site.json').read_text(encoding='utf8'));morph=json.loads((DATA/'caries-36.json').read_text(encoding='utf8'));manifest=json.loads((d.OUT/'manifest.json').read_text(encoding='utf8'));items={v['fdi']:v for v in manifest['teeth']}
def B(v):
    q=np.asarray(v).copy()[...,[0,2,1]];q[...,1]*=-1;return q
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def lin(rgb):return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
def material(name):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;nt=mat.node_tree;pr=nt.nodes['Principled BSDF'];col=nt.nodes.new('ShaderNodeVertexColor');col.layer_name='Review albedo';nt.links.new(col.outputs['Color'],pr.inputs['Base Color']);pr.inputs['Roughness'].default_value=.43;pr.inputs['IOR'].default_value=1.57;return mat
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
source={};materials={i:material(str(i)) for i in [36,37]}
for i in [36,37]:
    j,b=d.glb(d.OUT/('hero-36.glb' if i==36 else 'dentition.glb'));key='ToothExterior' if i==36 else 'FDI_37';pr=next(x for x in j['meshes'] if x['name']==key)['primitives'][0];p=d.accessor(j,b,pr['attributes']['POSITION']).astype(float);n=d.accessor(j,b,pr['attributes']['NORMAL']).astype(float);f=d.accessor(j,b,pr['indices']).reshape(-1,3);M=np.asarray(items[i]['matrix']).reshape(4,4).T.copy();M[1,3]-=.48;D=np.zeros_like(p);N=np.zeros_like(n);region=np.zeros((len(p),4))
    if i==36:
        if morph.get('refinement'):
            recipe=morph['refinement'];p=extend(p,recipe);n=extend(n,recipe,normalize=True);f=faces_after_refinement(f,recipe)
            D=np.zeros_like(p);N=np.zeros_like(n);region=np.zeros((len(p),4))
        ix=morph['indices'];D[ix]=np.array(morph['positionDelta']).reshape(-1,3);N[ix]=np.array(morph['normalDelta']).reshape(-1,3);region[ix]=np.array(morph['region']).reshape(-1,4)
    mesh=bpy.data.meshes.new('FDI'+str(i));mesh.from_pydata((B(d.affect(M,p))/100).tolist(),[],f.tolist());mesh.update();mesh.polygons.foreach_set('use_smooth',np.ones(len(f),bool));colors=mesh.color_attributes.new(name='Review albedo',type='FLOAT_COLOR',domain='POINT');obj=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(materials[i]);source[i]=(p,n,f,M,D,N,region,mesh,colors)
target=B(site['lesion']['centerWorldCm'])/100;D=B(site['lesion']['macroCamera']['directionFromLesionToCameraWorld']);u=B(site['lesion']['basisWorld']['buccalLingualTangentBuccalPositive']);v=B(site['lesion']['basisWorld']['occlusalGingivalTangentOcclusalPositive'])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True;scene.cycles.seed=36;scene.cycles.max_bounces=6
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices();devices=[d for d in prefs.devices if d.type=='OPTIX'];assert devices
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
if '--cpu' in sys.argv:scene.cycles.device='CPU'
scene.render.resolution_x=850;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.world=bpy.data.worlds.new('Neutral');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.8,.8,.8,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.24;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
def light(name,offset,energy,width,height):
    l=bpy.data.lights.new(name,'AREA');l.energy=energy;l.shape='RECTANGLE';l.size=width;l.size_y=height;o=bpy.data.objects.new(name,l);scene.collection.objects.link(o);o.location=Vector(target+offset);look(o,target)
light('Upper-left source',D*.017-u*.009+v*.010,.010,.014,.010);light('Broad fill',D*.018+u*.009-v*.003,.003,.016,.018)
camera=bpy.data.cameras.new('Measured macro');camera.type='PERSP';camera.lens=165;camera.sensor_width=36;camera.clip_start=.0001;camera.clip_end=.5;o=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(o);scene.camera=o;o.location=Vector(target+D*.031);look(o,target)
for phase,depth,early,late,clay in [('healthy-clay',0,0,0,True),('mature-clay',1,0,0,True),('healthy',0,0,0,False),('early',0,1,0,False),('mature',1,1,1,False)]:
    if '--mature-clay-only' in sys.argv and phase!='mature-clay':continue
    for i,(p,n,f,M,delta,deltaN,reg,mesh,colors) in source.items():
        pos=B(d.affect(M,p+delta*depth))/100;normal=B(d.norm((n+deltaN*depth)@np.linalg.inv(M[:3,:3])));mesh.vertices.foreach_set('co',pos.ravel());mesh.update();mesh.normals_split_custom_set_from_vertices(normal.tolist());base=np.tile(lin(np.array([.70,.70,.70]) if clay else np.array([.935,.918,.881])),(len(p),1))
        if i==36 and not clay:
            a=reg[:,0,None]*early*.80;base=base*(1-a)+lin(np.array([.967,.957,.907]))*a;a=reg[:,2,None]*late*.72;base=base*(1-a)+lin(np.array([.68,.53,.39]))*a;a=reg[:,1,None]*late;base=base*(1-a)+lin(np.clip(np.array([.55,.415,.31])[None,:]+(reg[:,3,None]-.5)*.065,0,1))*a
        rgba=np.column_stack([base,np.ones(len(p))]);colors.data.foreach_set('color',rgba.ravel())
    scene.render.filepath=str((OUT/(phase+'.png')).resolve());bpy.ops.render.render(write_still=True)
