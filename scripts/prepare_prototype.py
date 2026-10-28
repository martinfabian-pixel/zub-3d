"""Build only public/prototype-assets from the immutable Dundee exterior.

python scripts/prepare_prototype.py
Requires requirements-model.txt and Blender 4.5 LTS for deterministic local
visibility rays. BLENDER_BIN overrides PATH. No existing demo assets are edited.
There is no subdivision, surface displacement, tissue shell or root grafting.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, io, json, math, os, shutil, struct
import subprocess, sys, tempfile
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/prototype-assets'
SOURCE=ROOT/'assets/source/dundee'
BLENDER=Path(os.environ.get('BLENDER_BIN') or shutil.which('blender') or str(ROOT.parent/'professional-tools/blender-4.5.14-windows-x64/blender.exe'))
try:
    import bpy
    IN_BLENDER=True
except ImportError:
    IN_BLENDER=False
if not IN_BLENDER:
    from PIL import Image
    from scipy.interpolate import LinearNDInterpolator
    from scipy.ndimage import gaussian_filter, distance_transform_edt
    import trimesh
    spec=importlib.util.spec_from_file_location('existing_read_only_helpers',ROOT/'scripts/professional_model.py')
    anatomy=importlib.util.module_from_spec(spec);spec.loader.exec_module(anatomy)


def sha(data):return hashlib.sha256(data).hexdigest()


def source_surface():
    s=anatomy.source_surface(SOURCE/'scene.gltf')
    doc=json.loads((SOURCE/'scene.gltf').read_text());blob=(SOURCE/'scene.bin').read_bytes()
    attrs=doc['meshes'][0]['primitives'][0]['attributes']
    rotation=s['matrix'][:3,:3]/np.linalg.norm(s['matrix'][:3,0])
    # Keep the original authored normal field; do not recompute it on the
    # triangulated surface or flatten it through an artificial tissue rim.
    n=anatomy.helpers.accessor(doc,blob,attrs['NORMAL']).astype(float)@rotation.T
    n/=np.linalg.norm(n,axis=1)[:,None]
    t=anatomy.helpers.accessor(doc,blob,attrs['TANGENT']).astype(float)
    t[:,:3]=t[:,:3]@rotation.T
    t[:,:3]-=np.sum(t[:,:3]*n,axis=1)[:,None]*n
    t[:,:3]/=np.linalg.norm(t[:,:3],axis=1)[:,None]
    s['normals']=n;s['tangents']=t
    return s


def visibility_in_blender(path):
    """Cosine hemisphere rays against only the native closed outer surface."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    with np.load(path) as data:
        p=data['p'];normal=data['n'];f=data['f']
    _,first,inverse=np.unique(np.round(p,7),axis=0,return_index=True,return_inverse=True)
    wp=p[first];n=normal[first];wf=inverse[f]
    tree=BVHTree.FromPolygons(wp.tolist(),wf.tolist(),all_triangles=True,epsilon=0)
    axis=np.zeros_like(n);axis[:,1]=1;axis[np.abs(n[:,1])>.9]=[1,0,0]
    tangent=np.cross(axis,n);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    bitangent=np.cross(n,tangent)
    samples=40;radius=.65;visible=np.zeros(len(wp))
    for sample in range(samples):
        u=(sample+.5)/samples;phi=sample*(math.pi*(3-math.sqrt(5)))
        direction=(tangent*math.cos(phi)+bitangent*math.sin(phi))*math.sqrt(u)+n*math.sqrt(1-u)
        for k in range(len(wp)):
            hit=tree.ray_cast(Vector(wp[k]+n[k]*.002),Vector(direction[k]),radius)
            if hit[0] is None:visible[k]+=1
        if sample%10==9:print('Local visibility rays',sample+1,'/',samples,flush=True)
    # This is deliberately mild local ambient visibility, not tooth staining.
    visibility=.4+.6*visible/samples
    np.savez(path,visibility=visibility[inverse])


def build_parameters(s,visibility):
    size=2048;y,x=np.mgrid[:size,:size];query=np.column_stack([x.ravel()/(size-1),y.ravel()/(size-1)])
    cej=anatomy.cervical_distance(s)
    curv,_=anatomy.source_curvature(s)
    values=np.column_stack([cej,s['normals'][:,1],curv,visibility])
    fields=LinearNDInterpolator(s['uv'],values)(query).reshape(size,size,4)
    source=np.asarray(Image.open(SOURCE/'textures/defaultMat_baseColor.png').convert('RGB').resize((size,size),Image.Resampling.LANCZOS),float)/255
    island=(source.max(2)>.12)&np.isfinite(fields).all(2)
    nearest=distance_transform_edt(~island,return_distances=False,return_indices=True)
    fields=fields[nearest[0],nearest[1]];source=source[nearest[0],nearest[1]]
    crown=anatomy.helpers.smoothstep(-.10,.10,fields[:,:,0])
    valley=anatomy.helpers.smoothstep(.04,.30,fields[:,:,2])*np.clip(fields[:,:,1],0,1)
    luminance=source.mean(2)
    variation=np.clip((luminance-gaussian_filter(luminance,18))/.055,-1,1)
    rough_enamel=.29-.025*np.clip(fields[:,:,1],0,1)+.025*valley+.008*variation
    rough_root=.49+.008*variation
    roughness=np.clip(rough_root*(1-crown)+rough_enamel*crown,.24,.51)
    channels=np.stack([crown,roughness,.5+.20*variation,np.clip(fields[:,:,3],.4,1)],axis=2)
    return Image.fromarray(np.uint8(np.clip(channels,0,1)*255+.5),'RGBA')


def normal_image(size):
    image=Image.open(SOURCE/'textures/defaultMat_normal.png').convert('RGB').resize((size,size),Image.Resampling.LANCZOS)
    color=Image.open(SOURCE/'textures/defaultMat_baseColor.png').convert('RGB').resize((size,size),Image.Resampling.LANCZOS)
    valid=np.asarray(color).max(2)>30
    nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True)
    data=np.asarray(image)[nearest[0],nearest[1]].astype(float)
    normal=data/127.5-1;normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    return Image.fromarray(np.uint8(np.clip(normal*.5+.5,0,1)*255+.5),'RGB')


def png(image):
    output=io.BytesIO();image.save(output,format='PNG',optimize=True);return output.getvalue()


def write_glb(s,parameters,normal,path):
    chunks=bytearray();views=[];accessors=[]
    def append(data,target=None):
        while len(chunks)%4:chunks.append(0)
        view={'buffer':0,'byteOffset':len(chunks),'byteLength':len(data)}
        if target:view['target']=target
        views.append(view);chunks.extend(data);return len(views)-1
    def attribute(array,kind,component=5126,target=34962):
        a=np.asarray(array,dtype='<f4' if component==5126 else '<u4')
        view=append(a.tobytes(),target);entry={'bufferView':view,'componentType':component,'count':len(a),'type':kind}
        if kind=='VEC3':entry.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        accessors.append(entry);return len(accessors)-1
    attrs={'POSITION':attribute(s['positions']/1000,'VEC3'),'NORMAL':attribute(s['normals'],'VEC3'),'TANGENT':attribute(s['tangents'],'VEC4'),'TEXCOORD_0':attribute(s['uv'],'VEC2')}
    indices=attribute(s['faces'].reshape(-1),'SCALAR',5125,34963)
    normal_view=append(normal);parameter_view=append(parameters)
    credit='Maxillary First Molar by University of Dundee School of Dentistry. Emily McDougall; Dr Andrew Mason; Mark Roughley. CC BY 4.0. Source: https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984. Adapted orientation, nominal scale and web material maps; native exterior anatomy retained.'
    doc={'asset':{'version':'2.0','generator':'ZUB isolated prototype source-preserving pipeline','copyright':credit,'extras':{'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/'}},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':'ToothExterior'}],
      'meshes':[{'name':'ToothExterior','primitives':[{'attributes':attrs,'indices':indices,'material':0}]}],
      'materials':[{'name':'ToothExterior','pbrMetallicRoughness':{'baseColorFactor':[.90,.88,.82,1],'metallicFactor':0,'roughnessFactor':1,'metallicRoughnessTexture':{'index':1}},'normalTexture':{'index':0,'scale':1},'extensions':{'KHR_materials_ior':{'ior':1.62}},'extras':{'parameterChannels':{'R':'enamel mask','G':'absolute roughness','B':'source tone variation centered at0.5','A':'local ambient visibility'},'optics':'Outer surface only; no measured tissue segmentation or true subsurface volume.'}}],
      'textures':[{'sampler':0,'source':0},{'sampler':0,'source':1}],
      'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],
      'images':[{'bufferView':normal_view,'mimeType':'image/png','name':'Native normal'},{'bufferView':parameter_view,'mimeType':'image/png','name':'Tissue parameters'}],
      'extensionsUsed':['KHR_materials_ior'],'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(chunks)}]}
    json_bytes=json.dumps(doc,separators=(',',':')).encode();json_bytes+=b' '*((-len(json_bytes))%4);chunks+=b'\0'*((-len(chunks))%4)
    out=struct.pack('<III',0x46546c67,2,12+8+len(json_bytes)+8+len(chunks))+struct.pack('<II',len(json_bytes),0x4e4f534a)+json_bytes+struct.pack('<II',len(chunks),0x004e4942)+chunks
    path.write_bytes(out)
    return {'bytes':len(out),'sha256':sha(out),'triangles':len(s['faces']),'vertices':len(s['positions']),'geometry_sha256':{name:sha(np.asarray(value,dtype='<f4' if name!='indices' else '<u4').tobytes()) for name,value in [('positions',s['positions']/1000),('normals',s['normals']),('tangents',s['tangents']),('uv',s['uv']),('indices',s['faces'])]}}


def main():
    # Snapshot the production files to prove this isolated build never writes them.
    protected=[ROOT/'public/models/molar.glb',ROOT/'public/models/molar-mobile.glb',ROOT/'public/models/provenance.json']
    before={str(p):sha(p.read_bytes()) for p in protected}
    s=source_surface();mesh=trimesh.Trimesh(s['positions'],s['faces'],process=True)
    assert mesh.is_watertight and mesh.is_winding_consistent
    assert not np.any(mesh.area_faces<1e-12)
    if not BLENDER.is_file():raise FileNotFoundError('Set BLENDER_BIN or add Blender to PATH.')
    with tempfile.TemporaryDirectory(prefix='zub-prototype-') as folder:
        data=Path(folder)/'visibility.npz';np.savez(data,p=s['positions'],n=s['normals'],f=s['faces'])
        subprocess.run([str(BLENDER),'--background','--factory-startup','--python',str(Path(__file__).resolve()),'--','--visibility',str(data)],check=True)
        with np.load(data) as result:visibility=result['visibility'].copy()
    parameters=build_parameters(s,visibility);DEST.mkdir(parents=True,exist_ok=True)
    outputs={}
    for label,size,filename in [('desktop',2048,'molar.glb'),('mobile',1024,'molar-mobile.glb')]:
        param=parameters if size==2048 else parameters.resize((size,size),Image.Resampling.LANCZOS)
        nmap=normal_image(size);param_bytes=png(param);normal_bytes=png(nmap)
        suffix='' if label=='desktop' else '-mobile'
        (DEST/('parameters'+suffix+'.png')).write_bytes(param_bytes);(DEST/('normal'+suffix+'.png')).write_bytes(normal_bytes)
        outputs[filename]=write_glb(s,param_bytes,normal_bytes,DEST/filename)
        outputs[filename].update(texture_size=size,rgba8_texture_memory_with_mips_mib=2*size*size*4*4/3/1048576)
    provenance={'model':'Permanent maxillary left first molar, FDI26 / UL6; three native roots','source':json.loads((SOURCE/'source-provenance.json').read_text()),
      'processing':['Original continuous exterior, triangles and UVs retained; no subdivision, simplification, concavity deepening, surface displacement, tissue layer, root graft or closure rim.','Original authored normals retained and transformed into presentation axes; tangents re-orthogonalized for numeric precision.','Crown oriented +Y; native arbitrary units scaled to illustrative21mm total height, positions stored in metres.','Native source normal map downsampled, renormalized and UV-island padded at2K/1K.','Native painted colors inform an approximate cervical contour and subtle tone variation, not the final tooth palette.','Deterministic local cosine-hemisphere visibility rays on the original exterior; no cores or artificial occluders.','One material, one primitive, embedded normal plus RGBA parameter map. No original vertex color or base-color texture multiplier.'],
      'parameters':{'color_space':'linear data / Three.NoColorSpace','flipY':False,'uv':'Original glTF TEXCOORD_0','R':'Enamel mask0root→1crown; inferred CEJ transition−0.10…+0.10mm geodesic distance.','G':'Absolute roughness: enamel~0.265–0.315, root~0.49. Set material.roughness=1 before multiplication.','B':'Source-derived local tone variation centered0.5. Suggested signed value=(B−0.5)*2 and color amplitude~0.02.','A':'Local ambient visibility;40deterministic cosine hemisphere rays/vertex,0.65mm maximum distance,2µm surface offset,remap0.4+0.6visibility.'},
      'geometry':{'watertight_after_uv_weld':bool(mesh.is_watertight),'consistent_winding':bool(mesh.is_winding_consistent),'welded_vertices':len(mesh.vertices),'components':len(mesh.split()),'nominal_height_metres':.021,'physical_displacement_mm':0,'native_roots':3},'outputs':outputs,
      'limitations':['CT-informed ZBrush educational reconstruction, not a raw microCT surface.','Source crown has broad smoothed fissures and limited secondary anatomy; preserving it avoids procedural jagged grooves but does not recover missing scan detail.','Cervical mask, material roughness and color variation are visual approximations, not measured tissue or optical data.','Single outer surface optical model; no true dentin/enamel segmented volumes or physically complete subsurface transport.','Nominal21mm scale is illustrative, not an original specimen measurement.'],'production_assets_sha256_before':before}
    assert all(sha(Path(p).read_bytes())==value for p,value in before.items()),'Production asset changed during prototype build.'
    provenance['production_assets_unchanged']=True
    provenance['material_export']={'alpha_mode':'OPAQUE','transmission':0,'extensions':['KHR_materials_ior'],'web_scattering_note':'The web viewer adds a restrained 6.5 percent direct-light wrapped-diffuse approximation; this is not transmitted light or volumetric subsurface scattering.'}
    (DEST/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'outputs':outputs,'production_assets_unchanged':True},indent=2))


if __name__=='__main__':
    if IN_BLENDER:visibility_in_blender(Path(sys.argv[sys.argv.index('--visibility')+1]))
    else:main()
