"""Package Dundee UL6 for ZUB. Original mesh arrays and normal map are preserved.
Run: python scripts/prepare_model.py (install requirements-model.txt first).
No subdivision, smoothing, decimation, grafting or anatomical deformation.
"""
import argparse, copy, hashlib, io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter
ROOT=Path(__file__).resolve().parents[1]

def digest(b): return hashlib.sha256(b).hexdigest()
def png(a):
    s=io.BytesIO(); Image.fromarray(np.uint8(np.clip(a,0,255))).save(s,format='PNG',optimize=True); return s.getvalue()
def smoothstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
def accessor(j,b,i):
    a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]
    dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    w={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']]; z=np.dtype(dt).itemsize
    return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*z),z))
def read_glb(path):
    b=path.read_bytes(); size=struct.unpack_from('<I',b,12)[0]
    return json.loads(b[20:20+size]),b[28+size:]
def geometry_fingerprints(j,b):
    p=j['meshes'][0]['primitives'][0]
    return {name:digest(accessor(j,b,index).tobytes()) for name,index in {**{k:v for k,v in p['attributes'].items() if k!='COLOR_0'},'INDICES':p['indices']}.items()}

def prepare(source,output):
    j=json.loads(source.read_text(encoding='utf8')); original=copy.deepcopy(j)
    assert len(j['buffers'])==1
    raw=(source.parent/j['buffers'][0]['uri']).read_bytes(); binary=bytearray(raw)
    prim=j['meshes'][0]['primitives'][0]; p=accessor(j,raw,prim['attributes']['POSITION'])
    triangles=len(accessor(j,raw,prim['indices']))//3
    # COLOR_0 is an artistic color layer, not geometry. Its dark pigment would
    # multiply the calibrated texture a second time. Disable it while leaving
    # the original source buffer bytes intact. Prune its unused accessor.
    old_color=prim['attributes'].pop('COLOR_0')
    j['accessors'].pop(old_color)
    prim['attributes']={k:(v-1 if v>old_color else v) for k,v in prim['attributes'].items()}
    if prim['indices']>old_color: prim['indices']-=1
    # Keep native arrays and source node transform. Parent rotation: crown +Y.
    native=np.array(j['nodes'][0]['matrix']).reshape(4,4).T
    world=(np.column_stack([p,np.ones(len(p))])@native.T)[:,:3]
    rotation=np.array([[0,0,1],[0,-1,0],[1,0,0]],float)
    assert np.isclose(np.linalg.det(rotation),1)
    turned=world@rotation.T; center=(turned.min(0)+turned.max(0))/2
    scale=.021/np.ptp(turned[:,1]); matrix=np.eye(4); matrix[:3,:3]=rotation*scale; matrix[:3,3]=-center*scale
    parent=len(j['nodes']); j['nodes'].append({'name':'ZUB presentation: crown up; nominal 21 mm','children':j['scenes'][0]['nodes'],'matrix':matrix.T.reshape(-1).tolist()}); j['scenes'][0]['nodes']=[parent]
    def embed(b,mime,name):
        binary.extend(b'\0'*(-len(binary)%4)); n=len(j['bufferViews']); j['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(b)}); binary.extend(b)
        return {'mimeType':mime,'bufferView':n,'name':name}
    color=source.parent/original['images'][0]['uri']; normal=source.parent/original['images'][1]['uri']
    base=np.array(Image.open(color).convert('RGB')); valid=base.max(2)>8
    # Prevent black mip seams before applying restrained artistic color grading.
    nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True)
    filled=base[nearest[0],nearest[1]]; filled[valid]=base[valid]
    # Native author-painted crown/root boundary, not measured segmentation.
    n=2048; sampled=np.asarray(Image.fromarray(filled).resize((n,n),Image.Resampling.LANCZOS),dtype=np.float32)/255
    chroma=(sampled[:,:,0]-sampled[:,:,2])/np.maximum(sampled[:,:,0],.05)
    enamel=gaussian_filter(1-smoothstep(.055,.155,chroma),18)
    # Calibrated warm off-white enamel and light cream roots. Slow warm/cool
    # variation and restrained native color relief are illustrative, not a photo.
    e_full=np.asarray(Image.fromarray(enamel).resize((filled.shape[1],filled.shape[0]),Image.Resampling.BICUBIC))
    root_color=np.array([.902,.874,.818],dtype=np.float32)
    enamel_color=np.array([.954,.939,.900],dtype=np.float32)
    full=root_color+e_full[:,:,None]*(enamel_color-root_color)
    color_rng=np.random.default_rng(126)
    cloud=gaussian_filter(color_rng.normal(size=(256,256)).astype(np.float32),13)
    cloud=np.clip(cloud/np.std(cloud),-2,2)
    cloud=np.asarray(Image.fromarray(cloud).resize((filled.shape[1],filled.shape[0]),Image.Resampling.BICUBIC))
    full+=cloud[:,:,None]*np.array([.0035,.0022,-.0015],dtype=np.float32)
    luminance=sampled@np.array([.2126,.7152,.0722],dtype=np.float32)
    detail=np.clip(luminance-gaussian_filter(luminance,18),-.035,.035)*.20
    detail=np.asarray(Image.fromarray(detail).resize((filled.shape[1],filled.shape[0]),Image.Resampling.BICUBIC))
    full+=detail[:,:,None]
    graded=np.rint(np.clip(full,0,1)*255).astype(np.uint8)
    j['images'][0]=embed(png(graded),'image/png','Calibrated off-white enamel and light cream roots; source UV/color relief')
    j['images'][1]=embed(normal.read_bytes(),'image/png','Original Dundee 4K normal; unchanged')
    rng=np.random.default_rng(26); broad=gaussian_filter(rng.normal(size=(n,n)).astype(np.float32),8); broad/=np.std(broad)
    fine=gaussian_filter(rng.normal(size=(n,n)).astype(np.float32),1.2); fine/=np.std(fine)
    rough=np.clip(.445-enamel*.210+broad*.009+fine*.003,.205,.485)
    packed=np.stack([enamel,rough,np.zeros_like(enamel)],-1)*255
    image_id=len(j['images']); j['images'].append(embed(png(packed),'image/png','Authored enamel mask and tissue roughness'))
    sampler=0; j['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]
    for texture in j['textures']: texture['sampler']=sampler
    mask=len(j['textures']); j['textures'].append({'sampler':sampler,'source':image_id})
    j['materials']=[{'name':'Warm off-white enamel / light cream roots; ZUB PBR',
        'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1,'metallicRoughnessTexture':{'index':mask}},
        'normalTexture':{'index':1,'scale':1},
        'extensions':{'KHR_materials_ior':{'ior':1.62},'KHR_materials_clearcoat':{'clearcoatFactor':.04,'clearcoatTexture':{'index':mask},'clearcoatRoughnessFactor':.23},'KHR_materials_transmission':{'transmissionFactor':.12,'transmissionTexture':{'index':mask}},'KHR_materials_volume':{'thicknessFactor':.035,'attenuationDistance':.0035,'attenuationColor':[.96,.90,.78]}},
        'extras':{'tissue_boundary':'Softened from native artist-painted colors, not clinical tissue segmentation.','appearance':'Calibrated synthetic color, original surface normal map, and authored PBR. No measured enamel thickness or optical properties.','volume_approximation':'Single exterior surface only; 0.035 native-unit thickness is about 0.412 mm after asset transforms. Not a segmented shell or full subsurface scattering.','attenuation_scaling':'A viewer applying additional uniform scale must multiply attenuationDistance by that scale; thickness already follows the model matrix.'}}]
    j['extensionsUsed']=['KHR_materials_ior','KHR_materials_clearcoat','KHR_materials_transmission','KHR_materials_volume']
    j['asset']['generator']='ZUB source-preserving PBR packaging'
    j['asset']['copyright']='University of Dundee, School of Dentistry. CC BY 4.0. Emily McDougall; Dr. Andrew Mason; Mark Roughley. Presentation adaptation: ZUB project.'
    j['asset']['extras'].update({'anatomy':'Permanent maxillary LEFT FIRST molar, FDI 26 / UL6; three native roots','modifications':'Existing presentation transform preserved; vertex color multiplier disabled; calibrated synthetic color and PBR optical settings','original_geometry_unchanged':True})
    fingerprints=geometry_fingerprints(j,raw)
    if output.exists():
        previous,previous_binary=read_glb(output)
        if previous.get('asset',{}).get('extras',{}).get('title')=='Maxillary First Molar':
            assert fingerprints==geometry_fingerprints(previous,previous_binary),'Geometry changes are forbidden.'
            assert j['nodes']==previous['nodes'] and j['scenes']==previous['scenes'],'Existing orientation/scale changes are forbidden.'
    j['buffers']=[{'byteLength':len(binary)}]; jb=json.dumps(j,ensure_ascii=False,separators=(',',':')).encode(); jb+=b' '*(-len(jb)%4); binary.extend(b'\0'*(-len(binary)%4))
    glb=struct.pack('<III',0x46546C67,2,28+len(jb)+len(binary))+struct.pack('<II',len(jb),0x4E4F534A)+jb+struct.pack('<II',len(binary),0x004E4942)+binary
    output.parent.mkdir(parents=True,exist_ok=True); output.write_bytes(glb)
    source_meta=json.loads((source.parent/'source-provenance.json').read_text(encoding='utf8'))
    meta={'model':'Permanent maxillary LEFT FIRST molar, FDI 26 / UL6, three native roots','source':source_meta,
        'processing':['Preserve original positions, normals, tangents, UVs and triangle indices byte-for-byte.','Preserve existing node transforms and scene orientation/nominal 21 mm presentation scale exactly.','No subdivision, simplification, smoothing, root grafting, added shell geometry or anatomy deformation.','Disable the native COLOR_0 material multiplier to prevent double-darkening; its original bytes remain in the source buffer.','Preserve original 4096x4096 normal-map bytes.','Derive and soften the crown/root mask from original painted colors, then author a calibrated off-white/cream color texture with slow subtle variation and restrained native color relief.','Add a 2048x2048 tissue-dependent roughness/polish/transmission mask.','Use IOR 1.62, restrained enamel transmission and an explicitly illustrative single-surface volume thickness; no measured tissue optics are claimed.'],
        'output':{'bytes':len(glb),'sha256':digest(glb),'vertices':len(p),'triangles':triangles,'geometry_attribute_sha256':fingerprints,'node_transform_sha256':digest(json.dumps(j['nodes'],sort_keys=True,separators=(',',':')).encode()),'scene_graph_sha256':digest(json.dumps(j['scenes'],sort_keys=True,separators=(',',':')).encode()),'original_geometry_buffer_sha256':digest(raw),'original_geometry_buffer_unchanged':bytes(binary[:len(raw)])==raw,'normal_map_unchanged':True,'vertex_color_multiplier_enabled':False,'textures_embedded':3,'nominal_height_metres':.021},
        'material':{'enamel_srgb':[.954,.939,.900],'root_srgb':[.902,.874,.818],'enamel_roughness':.235,'root_roughness':.445,'clearcoat':.04,'enamel_transmission':.12,'ior':1.62,'illustrative_thickness_native_units':.035,'illustrative_thickness_metres':.035*scale*float(native[0,0]),'attenuation_distance_metres':.0035,'attenuation_color':[.96,.90,.78]},
        'limitations':['CT-informed educational reconstruction, not an untouched high-resolution microCT scan.','Native roots and occlusal anatomy preserved; clinical accuracy not independently validated.','No segmented enamel shell/dentine core or measured thickness supplied.','Calibrated color and PBR settings are artistic visualization approximations, not photographic or measured surface color.','Single-surface transmission/volume approximates translucency, not full volumetric subsurface scattering.'],
        'optical_reference':'https://pubmed.ncbi.nlm.nih.gov/19566303/'}
    (output.parent/'provenance.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(meta['output'],indent=2))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__); ap.add_argument('--source',type=Path,default=ROOT/'assets/source/dundee/scene.gltf'); ap.add_argument('--output',type=Path,default=ROOT/'public/models/molar.glb'); a=ap.parse_args(); prepare(a.source,a.output)
