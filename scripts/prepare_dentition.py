"""Rebuild only the isolated 28-tooth experience atlas and its seating manifest.

python scripts/prepare_dentition.py [--manifest-only]
Requires numpy, scipy, Pillow, DracoPy and Blender 4.5 (BLENDER_BIN or PATH).
The immutable prototype GLB supplies both upper first molars; never rewrite it.
"""
from pathlib import Path
import argparse,hashlib,io,json,math,os,shutil,struct,subprocess,sys,tempfile
import numpy as np
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'assets/source/dentition';OUT=ROOT/'public/dentition-assets'
try:import bpy
except ImportError:bpy=None
if bpy is None:
    import DracoPy
    from PIL import Image
    from scipy.ndimage import map_coordinates,gaussian_filter,distance_transform_edt
    from scipy.interpolate import LinearNDInterpolator
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components

def sha(b):return hashlib.sha256(b).hexdigest()
def norm(v):return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-15)
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def affect(m,p):return p@m[:3,:3].T+m[:3,3]
def affine(r,t):
    m=np.eye(4);m[:3,:3]=r;m[:3,3]=t;return m
def glb(path):
    raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+size]),raw[28+size:]
def view(j,b,index):
    v=j['bufferViews'][index];o=v.get('byteOffset',0);return b[o:o+v['byteLength']]
def accessor(j,b,i):
    a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];width={'VEC4':4,'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];n=np.dtype(dt).itemsize
    return np.ndarray((a['count'],width),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*width),n)).copy()
def tex(j,b,index):return Image.open(io.BytesIO(view(j,b,j['images'][j['textures'][index]['source']]['bufferView']))).convert('RGB')
def sample(im,uv):
    uv=np.clip(uv,0,1);c=np.asarray(im,dtype=np.float32)/255;coords=[uv[:,1]*(len(c)-1),uv[:,0]*(c.shape[1]-1)]
    return np.column_stack([map_coordinates(c[:,:,k],coords,order=1,mode='nearest') for k in range(c.shape[2])])
def crossing(p,f,w):
    edges=np.unique(np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1),axis=0);a,b=edges.T;valid=(w[a]>=.5)!=(w[b]>=.5);a=a[valid];b=b[valid];t=(.5-w[a])/(w[b]-w[a]);return p[a]*(1-t[:,None])+p[b]*t[:,None]
def ring_points(x):
    center=(np.percentile(x,1,axis=0)+np.percentile(x,99,axis=0))*.5;theta=np.arctan2(x[:,2]-center[2],x[:,0]-center[0]);res=[]
    for a in np.arange(16)*2*np.pi/16:
        diff=abs(np.angle(np.exp(1j*(theta-a))));selected=x[diff<=np.pi/16];res.append(np.median(selected if len(selected) else x[np.argsort(diff)[:3]],axis=0))
    return np.asarray(res)
def hero(ref):
    j,b=glb(ROOT/'public/prototype-assets/molar.glb');pr=j['meshes'][0]['primitives'][0];at=pr['attributes'];p=accessor(j,b,at['POSITION']).astype(float);uv=accessor(j,b,at['TEXCOORD_0']);f=accessor(j,b,pr['indices']).reshape(-1,3);mask=sample(tex(j,b,1),uv)[:,0];q=crossing(p,f,mask)
    sj=json.loads((ROOT/'assets/source/dundee/scene.gltf').read_text());raw=accessor(sj,(ROOT/'assets/source/dundee/scene.bin').read_bytes(),sj['meshes'][0]['primitives'][0]['attributes']['POSITION']).astype(float)
    fit=np.linalg.lstsq(np.column_stack([raw,np.ones(len(raw))]),p,rcond=None)[0].T;C=np.eye(4);C[:3]=fit;assert np.linalg.norm(affect(C,raw)-p,axis=1).max()<2e-9
    return {'p':p,'f':f,'uv':uv,'mask':mask,'ring':ring_points(q),'C':C,'scale':np.linalg.norm(C[:3,0])*1000,'origin_basis':'mesh_local'}
def decode(d,placement,scale):
    path=SRC/d['file'];assert sha(path.read_bytes())==d['sha256'];j,b=glb(path);pr=j['meshes'][0]['primitives'][0];ext=pr['extensions']['KHR_draco_mesh_compression'];dr=DracoPy.decode(view(j,b,ext['bufferView']));at={k:dr.get_attribute_by_unique_id(i)['data'] for k,i in ext['attributes'].items()};raw=at['POSITION'].astype(float);uv=at['TEXCOORD_0'].astype(float);f=dr.faces.astype(int)
    inner=np.asarray(placement['source_mesh_local_to_source_pre_sketchfab']);p=affect(inner,raw);source_normal=norm(at['NORMAL']@np.linalg.inv(inner[:3,:3]));m=j['materials'][pr.get('material',0)];paint=tex(j,b,m['pbrMetallicRoughness']['baseColorTexture']['index']).resize((512,512),Image.Resampling.LANCZOS);ni=m.get('normalTexture',{}).get('index');normal=tex(j,b,ni).resize((512,512),Image.Resampling.LANCZOS) if ni is not None else Image.new('RGB',(512,512),(128,128,255))
    if d['source']==33:
        # This scan includes one small, reversed closed inner cavity (2.1 mm³)
        # entirely within the 626.7 mm³ exterior. Only the exterior is displayed.
        _,iv=np.unique(p,axis=0,return_inverse=True);e=iv[f[:,[0,1,2,0]]];u=e[:,:-1].ravel();v=e[:,1:].ravel();g=coo_matrix((np.ones(len(u)),(u,v)),shape=(iv.max()+1,iv.max()+1));_,labels=connected_components(g,directed=False);fid=labels[iv[f[:,0]]];f=f[fid==np.bincount(fid).argmax()];idx,fi=np.unique(f,return_inverse=True);f=fi.reshape(-1,3);p=p[idx];uv=uv[idx];source_normal=source_normal[idx]
    color=sample(paint,uv);warm=(color[:,0]-color[:,2])/np.maximum(color[:,0],.02);height=p[:,2]*(1 if d['source']>=30 else -1);top=np.median(warm[height>np.quantile(height,.8)]);bottom=np.median(warm[height<np.quantile(height,.25)]);assert bottom-top>.07,(d['source'],top,bottom)
    mask=smooth(.32,.70,(bottom-warm)/(bottom-top));q=crossing(p,f,mask);center=(np.percentile(q,1,axis=0)+np.percentile(q,99,axis=0))*.5
    N=np.asarray(placement['source_pre_sketchfab_to_assembled_pre_sketchfab']);up=norm(np.linalg.solve(N[:3,:3],placement['target_crownward_axis_native']));front=norm(np.linalg.solve(N[:3,:3],placement['target_buccal_axis_native_from_arch']));front=norm(front-up*(up@front));x=norm(np.cross(up,front));F=np.stack([x,up,front]);C=affine(F*scale/1000,-F@center*scale/1000)
    local=affect(C,p);return {'p':local,'f':f,'n':norm(source_normal@F.T),'uv':uv,'mask':mask,'ring':ring_points(affect(C,q)),'C':C,'origin_basis':'pre_sketchfab','paint':paint,'normal':normal,'warmLimits':[float(top),float(bottom)]}
def prepare_sources():
    ref=json.loads((SRC/'placement-28.json').read_text());sources=json.loads((SRC/'sources.json').read_text());models={26:hero(ref)}
    for d in sources:models[d['source']]=decode(d,ref['teeth'][str(d['source'])],models[26]['scale'])
    return ref,sources,models
def manifest(ref,sources,models):
    # Only one shared change of coordinates for BOTH arches. The bite and each
    # side's separately registered pose remain intact, including asymmetry.
    native_from_world=np.array([[1,0,0],[0,0,1],[0,-1,0.]])
    teeth=ref['teeth'];bds=np.array([v['target_bounds_native'] for v in teeth.values()]);middle=(bds[:,0].min(0)+bds[:,1].max(0))*.5
    middle[0]=np.mean([teeth[str(i)]['target_crown_landmark_native'][0] for i in [11,21,31,41]])
    middle[2]=np.mean([teeth[str(i)]['target_crown_landmark_native'][2] for i in [16,26,36,46]])
    R=native_from_world*ref['illustrative_mm_per_native_unit']/10;world=affine(R,-R@middle);items=[];all_world=[]
    for string,record in sorted(teeth.items(),key=lambda pair:int(pair[0])):
        fdi=int(string);number=(20 if fdi<30 else 30)+(fdi%10);model=models[number];N=np.asarray(record['source_'+model['origin_basis']+'_to_assembled_pre_sketchfab']);M=world@N@np.linalg.inv(model['C']);p=model['p'];q=model['ring'];crown=p[model['mask']>.5];bounds=np.stack([p.min(0),p.max(0)]);worldp=affect(M,p);all_world.append(np.stack([worldp.min(0),worldp.max(0)]));size=np.ptp(crown,axis=0)*1000
        item={'fdi':fdi,'source':number,'node':'ToothExterior' if number==26 else 'FDI_'+str(number),'matrix':M.T.ravel().tolist(),'bounds':bounds.ravel().tolist(),'cervicalRing':q.tolist(),'crownHeightMm':float((crown[:,1].max()-np.median(q[:,1]))*1000),'mesiodistalWidthMm':float(size[0]),'buccolingualWidthMm':float(size[2]),'worldBoundsCm':np.stack([worldp.min(0),worldp.max(0)]).ravel().tolist(),'reflected':bool(np.linalg.det(M[:3,:3])<0),'fitRmsNominalMm':record['fit_rms_nominal_mm']};items.append(item)
    all_world=np.array(all_world);return {'schemaVersion':1,'teeth':items,'sources':sources+[{'source':26,'file':'../prototype-assets/molar.glb','title':'Maxillary First Molar','author':'University of Dundee, School of Dentistry','license':'CC-BY-4.0','url':'https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984','sha256':sha((ROOT/'public/prototype-assets/molar.glb').read_bytes())}], 'units':'GLB local metres. Column-major matrix maps GLB local metres directly to scene centimetres; Matrix4.fromArray(matrix). +X patient left, +Y superior, +Z anterior. Do not mirror twice or independently recenter arches.','boundsConvention':'bounds=[local minX,minY,minZ,maxX,maxY,maxZ] in metres. cervicalRing is 16 ordered local metre points estimated from native painted CEJ; not measured gingiva.','archBoundsCm':np.stack([all_world[:,0].min(0),all_world[:,1].max(0)]).ravel().tolist(),'assemblySource':ref['source'],'assemblyLicense':'CC-BY-4.0','worldFromAssemblyNative':world.T.ravel().tolist(),'registrationNote':'Right positions independently fit to the corresponding Dundee right reference shapes using reflected left geometry. This is an educational source arrangement, not a clinically validated occlusion.','identificationNote':'Published lower central/lateral incisor titles conflict with native LL1/LL2 object labels and geometry. IDs31/41 use the lateral-titled LL1 asset, IDs32/42 use central-titled LL2, independently verified against full-arch source shape.','heroNote':'FDI16/26 use the original approved upper-left first molar, optionally reflected by its placement. No Carabelli substitute.'}
def write_manifest(doc):
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'manifest.json').write_text(json.dumps(doc,indent=2)+'\n',encoding='utf8')

def write_credits(doc):
    lines=['ZUB-3D — pôvod modelov pre zážitok s 28 trvalými zubami','',
      'Anatomické podklady všetkých 14 predlôh a celkovej zostavy: University of Dundee, School of Dentistry. Vytvorenie modelov: Emily McDougall; odborný obsah: Dr. Andrew Mason; počiatočná 3D príprava: Mark Roughley. Zdrojové modely a odvodené geometrické a materiálové dáta: Creative Commons Attribution 4.0 International.','https://sketchfab.com/DundeeDental','https://creativecommons.org/licenses/by/4.0/','',
      'Polohy a natočenia vychádzajú zo samostatnej zostavy Permanent Dentition od tej istej školy (CC BY 4.0):',doc['assemblySource'],'',
      'Každá dvojica FDI používa osobitný ľavý anatomický typ. Pravý tvar je zrkadlený a jeho poloha je nezávisle prispôsobená pravému zubu v pôvodnej zostave. Zuby múdrosti nie sú súčasťou tejto prezentácie.','',
      'Pôvodné diela, ich oficiálne názvy a odkazy:']
    for source in sorted(doc['sources'],key=lambda d:d['source']):
        i=source['source'];other=i-10 if i<30 else i+10;lines.extend([f'FDI {i}/{other} — {source["title"]}',source['url']])
    lines.extend(['','Pri dolných rezákoch sa verejné názvy dvoch individuálnych súborov rozchádzajú s vnútornými označeniami LL1/LL2 a ich miestami v zostave. Priradenie 31/41 a 32/42 rešpektuje overený tvar a skutočnú polohu v zdrojovej zostave; pôvodné názvy vyššie uvádzame bez prepisu.','',
      'Trinásť individuálnych zdrojových súborov bolo získaných z verejného prehliadača TeethAtlas (https://www.teethatlas.com/). Každý obsahuje pôvodného autora, odkaz na príslušný Dundee model a licenciu CC BY 4.0. Presné adresy stiahnutia a kontrolné súčty sú v manifest.json a provenance.json. Zostava bola získaná z verejného vzdelávacieho prehliadača VAMO / inVisu.','',
      'Pri 26/16 sa používa bez zmeny schválený model Maxillary First Molar: Emily McDougall; odborný obsah Dr. Andrew Mason; počiatočná 3D príprava Mark Roughley. Jeho podrobná atribúcia: ../prototype-assets/credits.txt. Iný model s Carabelliho hrbolčekom tu použitý nie je.','',
      'Úpravy ostatných typov: súradnicové sústavy, dve zjednodušenia geometrie, zachované pôvodné UV, spoločné textúrové atlasy. Z pôvodných farebných a normálových máp vznikli masky skloviny a koreňa, lokálna drsnosť a jemná tónová variácia; ambientná viditeľnosť je odvodená z vonkajšej geometrie. Vnútorná dutina dolného očného zuba sa pri zobrazovaní vonkajšieho povrchu vynechala. Ilustračná mierka, malé vodorovné posuny na odstránenie prienikov a otvorenie oblúkov sú prezentačné úpravy, nie klinicky overená oklúzia. Ide o výučbové rekonštrukcie v ZBrush; Dundee uvádza CT podklad pri celkovej zostave a vybraných jednotlivých modeloch. Nejde o nespracované mikroCT skeny.','',
      'HDR prostredie Studio Small 09: Sergej Majboroda / Poly Haven, CC0.','https://polyhaven.com/a/studio_small_09','https://polyhaven.com/license','',
      'Kód prehliadača a jeho originálne procedurálne materiály: MIT. Three.js: MIT.','https://github.com/martinfabian-pixel/zub-3d','https://github.com/mrdoob/three.js/blob/dev/LICENSE','',
      'Pri ďalšom použití modelov alebo odvodených máp zachovajte atribúciu, odkaz na CC BY 4.0 a opis úprav. Schválenie projektu autormi podkladov sa netvrdí.'])
    (OUT/'credits.txt').write_text('\n'.join(lines)+'\n',encoding='utf8')

def display_clearance(doc):
    settings=json.loads((SRC/'presentation-clearance.json').read_text());offsets=settings['per_fdi_translation_world_cm'];all_bounds=[]
    for tooth in doc['teeth']:
        base=tooth.get('sourceMatrix',tooth['matrix']).copy();delta=np.asarray(offsets[str(tooth['fdi'])]);M=np.asarray(base).reshape(4,4).T.copy();M[:3,3]+=delta
        tooth['sourceMatrix']=base;tooth['matrix']=M.T.ravel().tolist();tooth['presentationOffsetCm']=delta.tolist();bounds=np.asarray(tooth.get('sourceWorldBoundsCm',tooth['worldBoundsCm'])).reshape(2,3);tooth['sourceWorldBoundsCm']=bounds.ravel().tolist();bounds=bounds+delta;tooth['worldBoundsCm']=bounds.ravel().tolist();all_bounds.append(bounds)
    b=np.asarray(all_bounds);doc['archBoundsCm']=np.stack([b[:,0].min(0),b[:,1].max(0)]).ravel().tolist();doc['displayClearanceNote']='matrix includes a bounded horizontal translation to reduce inherited interproximal overlap. Raw sourceMatrix and the explicit world-cm presentationOffsetCm are both retained for review. The viewer may open whole arches vertically; do not apply presentationOffsetCm a second time.'
    return doc

def blender_lods(folder):
    """Geometric edge collapse carries the source loop UVs to each LOD."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for file in sorted(folder.glob('input-*.npz')):
        number=int(file.stem.split('-')[-1]);data=np.load(file);p=data['p']*1000;n=data['n'];uv=data['uv'];f=data['f'];data.close()
        _,idx,iv=np.unique(np.round(p,6),axis=0,return_index=True,return_inverse=True);mesh=bpy.data.meshes.new('Exterior');mesh.from_pydata(p[idx].tolist(),[],iv[f].tolist());mesh.update();obj=bpy.data.objects.new('FDI_'+str(number),mesh);bpy.context.collection.objects.link(obj)
        mesh.polygons.foreach_set('use_smooth',np.ones(len(f),bool));ml=mesh.uv_layers.new(name='NativeUV');ml.data.foreach_set('uv',uv[f.ravel()].ravel());mesh.normals_split_custom_set(n[f.ravel()].tolist());mod=obj.modifiers.new('Source-preserving simplification','DECIMATE');mod.decimate_type='COLLAPSE';mod.use_collapse_triangulate=True
        for lod in ['desktop','mobile']:
            kind=number%10;target=([15500,15500,17500,19000,19000,22000,22000] if lod=='desktop' else [7000,7000,8000,8500,8500,10500,10500])[kind-1];mod.ratio=min(1,target/len(f));bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(dep);m=ev.to_mesh();m.calc_loop_triangles();m.calc_tangents(uvmap='NativeUV')
            po=np.empty(len(m.vertices)*3,np.float32);m.vertices.foreach_get('co',po);po=po.reshape(-1,3)
            lv=np.empty(len(m.loops),np.int32);m.loops.foreach_get('vertex_index',lv);nf=np.empty(len(m.corner_normals)*3,np.float32);m.corner_normals.foreach_get('vector',nf);nf=norm(nf.reshape(-1,3));tt=np.empty(len(lv)*3,np.float32);m.loops.foreach_get('tangent',tt);tt=tt.reshape(-1,3);tt-=nf*(nf*tt).sum(1)[:,None];bad=np.linalg.norm(tt,axis=1)<1e-6
            axis=np.zeros((bad.sum(),3));axis[:,0]=1;axis[abs(nf[bad,0])>.8]=[0,1,0];tt[bad]=np.cross(nf[bad],axis);tt=norm(tt);hand=np.empty(len(lv),np.float32);m.loops.foreach_get('bitangent_sign',hand);hand=np.where(hand<0,-1,1)
            uvout=np.empty(len(lv)*2,np.float32);m.uv_layers.active.data.foreach_get('uv',uvout);uvout=uvout.reshape(-1,2);lt=np.empty(len(m.loop_triangles)*3,np.int32);m.loop_triangles.foreach_get('loops',lt)
            # Custom normal encoding can differ below 0.01° between neighboring
            # loops. Deduplicate on a stable precision, leaving true UV seams.
            packed=np.column_stack([lv,np.round(nf,4),np.round(tt,3),hand,np.round(uvout,7)]);_,first,inv=np.unique(packed[lt],axis=0,return_index=True,return_inverse=True);ids=lt[first];F=inv.reshape(-1,3);P=po[lv[ids]];N=nf[ids];T=np.column_stack([tt[ids],hand[ids]]);U=uvout[ids];out={'p':P/1000,'n':N,'t':T,'uv':U,'f':F}
            if lod=='desktop':
                # Short-range geometric visibility from the simplified exterior;
                # one deterministic cosine hemisphere per physical vertex.
                _,pi,pinv=np.unique(np.round(P,6),axis=0,return_index=True,return_inverse=True);pp=P[pi];nn=N[pi];tree=BVHTree.FromPolygons(pp.tolist(),pinv[F].tolist(),all_triangles=True,epsilon=0);axis=np.zeros_like(nn);axis[:,1]=1;axis[abs(nn[:,1])>.9]=[1,0,0];u=norm(np.cross(axis,nn));v=np.cross(nn,u);start=[Vector(z) for z in pp+nn*.008];hits=np.zeros(len(pp));samples=16
                for k in range(samples):
                    r=(k+.5)/samples;phi=k*math.pi*(3-math.sqrt(5));dire=(u*math.cos(phi)+v*math.sin(phi))*math.sqrt(r)+nn*math.sqrt(1-r)
                    hits+=np.fromiter((tree.ray_cast(a,Vector(d),.65)[0] is None for a,d in zip(start,dire)),dtype=float,count=len(pp))
                out['ao']=(.4+.6*hits/samples)[pinv]
            np.savez_compressed(folder/(f'{lod}-{number}.npz'),**out);ev.to_mesh_clear();print(number,lod,len(P),'vertices',len(F),'triangles',flush=True)
        bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(mesh)

def tile_images(model,lod):
    dim=496;y,x=np.mgrid[:dim,:dim];query=np.column_stack([x.ravel()/(dim-1),y.ravel()/(dim-1)]);color=np.asarray(model['paint'].resize((dim,dim),Image.Resampling.LANCZOS),float)/255;valid=color.max(2)>.13;near=distance_transform_edt(~valid,return_distances=False,return_indices=True);color=color[near[0],near[1]]
    top,bottom=model['warmLimits'];warm=(color[:,:,0]-color[:,:,2])/np.maximum(color[:,:,0],.02);mask=smooth(.32,.70,(bottom-warm)/(bottom-top));lum=color.mean(2);variation=np.clip((lum-gaussian_filter(lum,6))/.055,-1,1)
    fields=LinearNDInterpolator(lod['uv'],np.column_stack([lod['ao'],lod['n'][:,1]]),fill_value=np.nan)(query).reshape(dim,dim,2);valid=valid&np.isfinite(fields).all(2);near=distance_transform_edt(~valid,return_distances=False,return_indices=True);fields=fields[near[0],near[1]]
    rough=(.49+.008*variation)*(1-mask)+(.29-.025*np.clip(fields[:,:,1],0,1)+.008*variation)*mask;params=np.stack([mask,rough,.5+.20*variation,np.clip(fields[:,:,0],.4,1)],axis=2)
    normal=np.asarray(model['normal'].resize((dim,dim),Image.Resampling.LANCZOS),float)/127.5-1;normal=norm(normal[near[0],near[1]])*.5+.5
    def encode(arr):return Image.fromarray(np.uint8(np.clip(np.pad(arr,((8,8),(8,8),(0,0)),mode='edge'),0,1)*255+.5))
    return encode(params),encode(normal)
def as_png(im):
    b=io.BytesIO();im.save(b,format='PNG',optimize=True);return b.getvalue()
def write_atlas(path,parts,params,normal):
    buffer=bytearray();views=[];acc=[];meshes=[];nodes=[];stats={}
    def append(data,target=None):
        buffer.extend(b'\0'*((-len(buffer))%4));v={'buffer':0,'byteOffset':len(buffer),'byteLength':len(data)}
        if target:v['target']=target
        views.append(v);buffer.extend(data);return len(views)-1
    def attr(array,kind,index=False,bounds=False):
        arr=np.ascontiguousarray(array,dtype='<u2' if index else '<f4');a={'bufferView':append(arr.tobytes(),34963 if index else 34962),'componentType':5123 if index else 5126,'count':len(arr),'type':kind}
        if bounds:a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
        acc.append(a);return len(acc)-1
    for number,z in parts:
        p=z['p'];f=z['f'];assert len(p)<65536;at={'POSITION':attr(p,'VEC3',bounds=True),'NORMAL':attr(z['n'],'VEC3'),'TANGENT':attr(z['t'],'VEC4'),'TEXCOORD_0':attr(z['packedUv'],'VEC2')};idx=attr(f.ravel(),'SCALAR',index=True);name='FDI_'+str(number);nodes.append({'name':name,'mesh':len(meshes)});meshes.append({'name':name,'primitives':[{'attributes':at,'indices':idx,'material':0}]});stats[str(number)]={'triangles':len(f),'vertices':len(p)}
    images=[{'name':'Source tangent normal atlas','mimeType':'image/png','bufferView':append(normal)},{'name':'Tissue parameter atlas','mimeType':'image/png','bufferView':append(params)}]
    doc={'asset':{'version':'2.0','generator':'ZUB-3D dentition atlas','copyright':'University of Dundee School of Dentistry. CC BY 4.0. Adapted source geometry, UV and maps; see credits.txt, manifest.json and provenance.json for all individual source links.','extras':{'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/'}},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'materials':[{'name':'DundeeDentalTissue','normalTexture':{'index':0},'pbrMetallicRoughness':{'baseColorFactor':[.88,.85,.78,1],'metallicFactor':0,'roughnessFactor':1,'metallicRoughnessTexture':{'index':1}},'extensions':{'KHR_materials_ior':{'ior':1.62}},'extras':{'parameterChannels':'R enamel mask, G absolute roughness, B source tone variation around0.5, A short-range geometric ambient visibility'}}],'extensionsUsed':['KHR_materials_ior'],'images':images,'textures':[{'sampler':0,'source':i} for i in range(2)],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'accessors':acc,'bufferViews':views,'buffers':[{'byteLength':len(buffer)}]}
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);buffer+=b'\0'*((-len(buffer))%4);out=struct.pack('<III',0x46546c67,2,28+len(j)+len(buffer))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(buffer),0x004e4942)+buffer;path.write_bytes(out)
    return {'bytes':len(out),'sha256':sha(out),'meshes':stats,'triangles':sum(s['triangles'] for s in stats.values())}
def build_atlas(doc,models):
    blender=os.environ.get('BLENDER_BIN') or shutil.which('blender') or str(ROOT.parent/'professional-tools/blender-4.5.14-windows-x64/blender.exe');assert Path(blender).is_file(),'Set BLENDER_BIN to Blender4.5 LTS'
    ids=sorted(k for k in models if k!=26);results={}
    with tempfile.TemporaryDirectory(prefix='zub-dentition-') as directory:
        folder=Path(directory)
        for number in ids:np.savez(folder/f'input-{number}.npz',**{k:models[number][k] for k in ['p','n','uv','f']})
        subprocess.run([blender,'--background','--factory-startup','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--','--decimate',str(folder)],check=True)
        prm=Image.new('RGBA',(2048,2048),(0,125,128,255));nrm=Image.new('RGB',(2048,2048),(128,128,255));lods={'desktop':[],'mobile':[]}
        for idx,number in enumerate(ids):
            col,row=idx%4,idx//4
            for lod in lods:
                with np.load(folder/(f'{lod}-{number}.npz')) as z:part={k:z[k].copy() for k in z.files}
                part['packedUv']=(np.array([col,row])*512+8+np.clip(part['uv'],0,1)*496)/2048;lods[lod].append((number,part))
                if lod=='desktop':a,b=tile_images(models[number],part);prm.paste(a,(col*512,row*512));nrm.paste(b,(col*512,row*512))
        for lod,parts in lods.items():
            dim=2048 if lod=='desktop' else 1024;fname='dentition.glb' if lod=='desktop' else 'dentition-mobile.glb';params=prm if lod=='desktop' else prm.resize((dim,dim),Image.Resampling.LANCZOS);n=nrm if lod=='desktop' else nrm.resize((dim,dim),Image.Resampling.LANCZOS);results[fname]=write_atlas(OUT/fname,parts,as_png(params),as_png(n));results[fname]['mapResolution']=dim;print(fname,results[fname]['bytes'],results[fname]['triangles'],flush=True)
    doc['lods']=results;write_manifest(doc)
    provenance={'license':'CC-BY-4.0','sources':doc['sources'],'placementSource':doc['assemblySource'],'selection':'One genuine left model per anatomical tooth type, with right geometry reflected and independently fitted to the corresponding original right-side reference. Third molars excluded. The existing single-surface prototype supplies upper first molars unchanged.','processing':['Remove Sketchfab display normalization, retaining subnode transforms; restore actual reference relationship through source-based registration.','Use cervical color boundary and source crown/arch axes for individual canonical frames. Original projected 33/43 inner cavity is omitted from the exterior render.','Blender 4.5 quadric collapse with original UVs; two independently simplified LODs. Smooth shading normals and MikkTSpace tangents.','Pack thirteen original normal maps and derived enamel-mask/roughness/tone/ambient-visibility maps into two shared texture atlases. 16 local visibility samples at0.65mm on desktop LOD, reused for mobile. No runtime Draco decoder or network textures.','Keep approved FDI26/16 asset separate; do not author a substitute or apply new surface displacement.'],'limitations':['ZBrush teaching reconstructions; the author explicitly identifies CT inputs for the assembly and selected individual models, not every source. No raw clinical scan is claimed. Source units globally normalized to21mm for the reference UL6, not measured specimen dimensions.','Cervical ring and tissue parameters inferred from author colors, not measured segmentation or optical properties.','Mirrored left morphology does not retain the individual right-side shape, though actual independently fitted right positions remain asymmetric.','The reference is educational and contains some closed-bite overlaps. A display opening or pose-only clearances do not establish a clinically validated occlusion.'],'outputs':results}
    provenance['contributors']={'all_14_models_and_assembly':'University of Dundee, School of Dentistry','created_by':'Emily McDougall','content_expert':'Dr. Andrew Mason','initial_3D_preparation':'Mark Roughley'}
    (OUT/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8')

def main():
    if '--update-poses' in sys.argv:
        doc=display_clearance(json.loads((OUT/'manifest.json').read_text()));write_manifest(doc);write_credits(doc);return
    ref,sources,models=prepare_sources();doc=display_clearance(manifest(ref,sources,models));write_manifest(doc);write_credits(doc);print('Prepared',len(doc['teeth']),'placements; bounds cm',doc['archBoundsCm'],flush=True)
    if '--manifest-only' not in sys.argv:build_atlas(doc,models)

if __name__=='__main__':
    if bpy is None:main()
    elif '--decimate' in sys.argv:blender_lods(Path(sys.argv[sys.argv.index('--decimate')+1]))
