"""Source-aware layered molar preparation and diagnostics.
This pipeline derives presentation surfaces from the licensed Dundee UL6.
It does not imply measured tissue segmentation or clinical validation.

Build (Blender 4.5 LTS; external Python dependencies in requirements-model.txt):
  python scripts/professional_model.py --prepare
  blender --background --factory-startup --python scripts/professional_model.py
  python scripts/professional_model.py --metadata
Set BLENDER_BIN when Blender is not on PATH. Geometric analysis uses mm;
the exported GLB and editable Blender objects use nominal metres.
"""
from pathlib import Path
import argparse, importlib.util, json, sys, os, subprocess, tempfile, hashlib, io, shutil
import numpy as np
try:
    import bpy
    IN_BLENDER=True
except ImportError:
    IN_BLENDER=False
if not IN_BLENDER:
    from PIL import Image
    from scipy.ndimage import map_coordinates, gaussian_filter, distance_transform_edt
    from scipy.interpolate import LinearNDInterpolator
    from scipy.sparse import coo_matrix, diags
    from scipy.sparse.linalg import cg
    from scipy.sparse.csgraph import dijkstra
    import trimesh
ROOT=Path(__file__).resolve().parents[1]
BLENDER=Path(os.environ.get('BLENDER_BIN') or shutil.which('blender') or str(ROOT.parent/'professional-tools/blender-4.5.14-windows-x64/blender.exe'))
if not IN_BLENDER:
    spec=importlib.util.spec_from_file_location('legacy_model_helpers',ROOT/'scripts/prepare_model.py')
    helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)

def world_matrix(doc):
    def visit(index,parent):
        node=doc['nodes'][index]
        local=np.array(node.get('matrix',np.eye(4).T.reshape(-1))).reshape(4,4).T
        matrix=parent@local
        if node.get('mesh')==0: return matrix
        for child in node.get('children',[]):
            found=visit(child,matrix)
            if found is not None:return found
    for root in doc['scenes'][doc.get('scene',0)]['nodes']:
        found=visit(root,np.eye(4))
        if found is not None:return found
    raise ValueError('No source mesh')

def sample(image,uv):
    xy=[uv[:,1]*(image.shape[0]-1),uv[:,0]*(image.shape[1]-1)]
    return np.column_stack([map_coordinates(image[:,:,i],xy,order=1,mode='nearest') for i in range(image.shape[2])])

def source_surface(path=ROOT/'assets/source/dundee/scene.gltf'):
    j=json.loads(path.read_text());b=(path.parent/j['buffers'][0]['uri']).read_bytes()
    prim=j['meshes'][0]['primitives'][0]; at=prim['attributes']; M=world_matrix(j)
    p=helpers.accessor(j,b,at['POSITION']).astype(float)
    p=(np.column_stack([p,np.ones(len(p))])@M.T)[:,:3]
    rotation=np.array([[0,0,1],[0,-1,0],[1,0,0]],float)
    p=p@rotation.T;center=(p.min(0)+p.max(0))/2; scale=21/np.ptp(p[:,1]);p=(p-center)*scale
    M[:3,:3]=rotation@M[:3,:3]
    R=M[:3,:3]/np.linalg.norm(M[:3,0])
    normals=helpers.accessor(j,b,at['NORMAL']).astype(float)@R.T
    tangent=helpers.accessor(j,b,at['TANGENT']).astype(float)
    tangent[:,:3]=tangent[:,:3]@R.T
    uv=helpers.accessor(j,b,at['TEXCOORD_0']).astype(float)
    faces=helpers.accessor(j,b,prim['indices']).reshape(-1,3).astype(np.int64)
    texroot=ROOT/'assets/source/dundee/textures'
    original_color=np.asarray(Image.open(texroot/'defaultMat_baseColor.png'),dtype=np.float32)/255
    original_normal=np.asarray(Image.open(texroot/'defaultMat_normal.png'),dtype=np.float32)/255
    color=sample(original_color,uv); normal=sample(original_normal,uv)*2-1
    normal/=np.linalg.norm(normal,axis=1)[:,None]
    enamel=1-helpers.smoothstep(.055,.155,(color[:,0]-color[:,2])/np.maximum(color[:,0],.05))
    # Texture seam duplicates are one physical surface. Their mask and smooth
    # geometric normal must agree before offsets and a watertight CEJ split.
    _,seam=np.unique(np.round(p,8),axis=0,return_inverse=True)
    counts=np.bincount(seam);wn=np.zeros((len(counts),3));we=np.zeros(len(counts))
    np.add.at(wn,seam,normals);np.add.at(we,seam,enamel)
    wn/=np.linalg.norm(wn,axis=1)[:,None];normals=wn[seam];enamel=(we/counts)[seam]
    bitangent=np.cross(normals,tangent[:,:3])*tangent[:,3,None]
    target=normal[:,0,None]*tangent[:,:3]+normal[:,1,None]*bitangent+normal[:,2,None]*normals
    target/=np.linalg.norm(target,axis=1)[:,None]
    return {'positions':p,'normals':normals,'tangents':tangent,'uv':uv,'faces':faces,'enamel':enamel,'normal_sample':normal,'detail_normals':target,'matrix':M,'source':str(path)}

def weld_info(p,faces):
    unique,index,inverse=np.unique(np.round(p,8),axis=0,return_index=True,return_inverse=True)
    face=inverse[faces]
    edges=np.unique(np.sort(np.concatenate([face[:,[0,1]],face[:,[1,2]],face[:,[2,0]]]),axis=1),axis=0)
    return index,inverse,edges

def source_curvature(s):
    p=s['positions'];f=s['faces'];n=s['normals'];index,inv,edges=weld_info(p,f)
    wp=p[index];wn=n[index];dv=wp[edges[:,1]]-wp[edges[:,0]];d=np.linalg.norm(dv,axis=1)
    delta=np.zeros_like(wp);sq=np.zeros(len(wp));kmax=np.zeros(len(wp))
    np.add.at(delta,edges[:,0],dv);np.add.at(delta,edges[:,1],-dv)
    np.add.at(sq,edges[:,0],d*d);np.add.at(sq,edges[:,1],d*d)
    # Normal variation estimates curvature without the sampling-valence noise
    # of the uniform position Laplacian. Average on the native surface only.
    bend_signed=-.5*np.sum((wn[edges[:,1]]-wn[edges[:,0]])*dv,axis=1)
    signed=np.zeros(len(wp));degree=np.zeros(len(wp))
    for side in (0,1):np.add.at(signed,edges[:,side],bend_signed);np.add.at(degree,edges[:,side],1)
    signed/=np.maximum(sq,1e-12)
    for _ in range(3):
        neighbors=np.zeros(len(wp));np.add.at(neighbors,edges[:,0],signed[edges[:,1]]);np.add.at(neighbors,edges[:,1],signed[edges[:,0]])
        signed=.55*signed+.45*neighbors/degree
    bend=np.linalg.norm(wn[edges[:,1]]-wn[edges[:,0]],axis=1)/np.maximum(d,1e-9)
    np.maximum.at(kmax,edges[:,0],bend);np.maximum.at(kmax,edges[:,1],bend)
    return signed[inv],kmax[inv]

def cervical_distance(s):
    index,inv,edges=weld_info(s['positions'],s['faces']);p=s['positions'][index];w=s['enamel'][index]-.5;length=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)
    crossing=w[edges[:,0]]*w[edges[:,1]]<0;ce=edges[crossing];cl=length[crossing]
    cost=np.abs(w[ce])/np.maximum(np.sum(np.abs(w[ce]),axis=1)[:,None],1e-10)*cl[:,None]
    seed=np.full(len(p),np.inf);np.minimum.at(seed,ce.reshape(-1),cost.reshape(-1));valid=np.where(np.isfinite(seed))[0]
    rows=np.concatenate([edges[:,0],np.full(len(valid),len(p))]);cols=np.concatenate([edges[:,1],valid]);values=np.concatenate([length,seed[valid]])
    graph=coo_matrix((values,(rows,cols)),shape=(len(p)+1,len(p)+1)).tocsr()
    return (dijkstra(graph,directed=False,indices=len(p))[:-1]*np.sign(w))[inv]

def subdivide_linear(s):
    f=s['faces'];edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);unique,inv=np.unique(np.sort(edges,axis=1),axis=0,return_inverse=True)
    count=len(s['positions']); a,b,c=np.split(inv+count,3)
    result={}
    for key,array in s.items():
        if isinstance(array,np.ndarray) and len(array)==count:
            result[key]=np.concatenate([array,(array[unique[:,0]]+array[unique[:,1]])*.5])
        else: result[key]=array
    result['faces']=np.concatenate([np.column_stack([f[:,0],a,c]),np.column_stack([a,f[:,1],b]),np.column_stack([c,b,f[:,2]]),np.column_stack([a,b,c])])
    for key in ['normals']:
        result[key]/=np.linalg.norm(result[key],axis=1)[:,None]
    result['tangents'][:,:3]/=np.linalg.norm(result['tangents'][:,:3],axis=1)[:,None]
    return result

def integrate_detail(s):
    """Screened surface Poisson integration of the actual source normal map."""
    normal_image=np.asarray(Image.open(ROOT/'assets/source/dundee/textures/defaultMat_normal.png'),dtype=np.float32)
    nts=sample(normal_image,s['uv']);nts[:,:2]=(nts[:,:2]-128)/127;nts[:,2]=nts[:,2]/127.5-1
    n=s['normals'];t=s['tangents'];bit=np.cross(n,t[:,:3])*t[:,3,None]
    gradient=-(t[:,:3]*nts[:,0,None]+bit*nts[:,1,None])/np.maximum(nts[:,2,None],.2)
    index,inv,edges=weld_info(s['positions'],s['faces']);p=s['positions'][index]
    wg=np.zeros((len(index),3));counts=np.bincount(inv);np.add.at(wg,inv,gradient);wg/=counts[:,None]
    wanted=np.sum(.5*(wg[edges[:,0]]+wg[edges[:,1]])*(p[edges[:,1]]-p[edges[:,0]]),axis=1)
    row=np.repeat(np.arange(len(edges)),2);col=edges.reshape(-1);val=np.tile([-1.,1.],len(edges))
    D=coo_matrix((val,(row,col)),shape=(len(edges),len(index))).tocsr()
    A=D.T@D+diags(np.full(len(index),.055));rhs=D.T@wanted
    height,info=cg(A,rhs,M=diags(1/A.diagonal()),rtol=1e-7,maxiter=250)
    if info!=0: print('Normal integration convergence code:',info)
    height=np.clip(height[inv],-.045,.045)
    enamel=s['enamel'];up=helpers.smoothstep(.15,.65,n[:,1]);top=helpers.smoothstep(5,7,s['positions'][:,1])
    return height*(.22*(1-enamel)+enamel*(.30+.70*up*top))

def cap_partition(p,inner,uv,faces,weight,level=.5):
    """Clip triangles at the source-painted cervical contour, sharing edges."""
    positions=list(p);inners=list(inner);tex=list(uv);vals=list(weight);cache={}
    signs=weight[faces]>=level;enamel=[faces[signs.all(1)]];root=[faces[~signs.any(1)]]
    def cross(a,b):
        key=tuple(sorted((int(a),int(b))))
        if key not in cache:
            t=(level-vals[a])/(vals[b]-vals[a]);new=len(positions)
            positions.append(p[a]*(1-t)+p[b]*t);inners.append(inner[a]*(1-t)+inner[b]*t);tex.append(uv[a]*(1-t)+uv[b]*t);vals.append(level);cache[key]=new
        return cache[key]
    for face in faces[signs.any(1)&~signs.all(1)]:
        for keep,dest in [(True,enamel),(False,root)]:
            poly=[]
            for k in range(3):
                a=int(face[k]);b=int(face[(k+1)%3]);ia=(weight[a]>=level)==keep;ib=(weight[b]>=level)==keep
                if ia: poly.append(a)
                if ia!=ib:poly.append(cross(a,b))
            if len(poly)>=3:dest.append(np.array([[poly[0],poly[i],poly[i+1]] for i in range(1,len(poly)-1)]))
    arrays=(np.asarray(positions),np.asarray(inners),np.asarray(tex))
    def compact(parts):
        f=np.concatenate(parts);used,inv=np.unique(f,return_inverse=True)
        return {'p':arrays[0][used],'inner':arrays[1][used],'uv':arrays[2][used],'f':inv.reshape(-1,3)}
    return compact(enamel),compact(root)

def closed_enamel(cap):
    p=cap['p'];inner=cap['inner'];f=cap['f'];uv=cap['uv'];N=len(p)
    _,_,weld=np.unique(np.round(p,8),axis=0,return_index=True,return_inverse=True)
    edge=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);we=np.sort(weld[edge],axis=1)
    _,inv,counts=np.unique(we,axis=0,return_inverse=True,return_counts=True)
    boundary=edge[counts[inv]==1];a=boundary[:,0];b=boundary[:,1]
    rim=np.concatenate([np.column_stack([b,a,a+N]),np.column_stack([b,a+N,b+N])])
    return {'p':np.concatenate([p,inner]),'uv':np.concatenate([uv,uv]),'f':np.concatenate([f,f[:,::-1]+N,rim]),'material':np.concatenate([np.zeros(len(f),int),np.ones(len(f),int),np.zeros(len(rim),int)])}

def prepare_layers(destination):
    s=source_surface();curv,bend=source_curvature(s)
    source_positions=s['positions'].copy()
    up=helpers.smoothstep(.35,.75,s['normals'][:,1]);top=helpers.smoothstep(5.6,7.3,s['positions'][:,1])
    valley=helpers.smoothstep(.045,.28,curv)*up*top*s['enamel']
    s['valley']=valley;s['curvature']=curv;s['cej_distance']=cervical_distance(s)
    high=subdivide_linear(s);detail=integrate_detail(high)
    height=-.14*high['valley']+detail
    high['positions']=high['positions']+high['normals']*height[:,None]
    original_count=len(s['positions']);s['positions']=high['positions'][:original_count].copy()
    elevation=helpers.smoothstep(2.7,10.3,source_positions[:,1])
    desired=.06+helpers.smoothstep(.08,.95,s['enamel'])*(.24+.62*np.sqrt(elevation)+.52*np.maximum(s['normals'][:,1],0))
    desired=.03+(desired-.03)*helpers.smoothstep(0,.34,s['cej_distance'])
    desired=np.where(s['cej_distance']<0,.03,desired)
    thickness=np.minimum(desired,np.maximum(.11,.48/np.maximum(bend,.2)))
    # Limit inset locally where a convex cusp is too narrow; no arbitrary folds.
    for _ in range(6):
        # The biological core is smooth; exterior micro-relief must not imprint
        # into the dentino-enamel interface and create narrow offset folds.
        core=source_positions-s['normals']*thickness[:,None]
        f=s['faces'];old=np.cross(source_positions[f[:,1]]-source_positions[f[:,0]],source_positions[f[:,2]]-source_positions[f[:,0]])
        new=np.cross(core[f[:,1]]-core[f[:,0]],core[f[:,2]]-core[f[:,0]])
        bad=np.sum(old*new,axis=1)<=0
        if not bad.any():break
        thickness[np.unique(f[bad])]*=.72
    assert not bad.any(),'Dentin offset folds require manual correction.'
    # Global collisions cannot be ruled out by face orientation alone. Run a
    # seam-welded Blender BVH refinement before constructing either interface.
    with tempfile.TemporaryDirectory(prefix='zub-inset-') as directory:
        if not BLENDER.is_file():raise FileNotFoundError('Blender executable not found. Set BLENDER_BIN to Blender 4.5 LTS or add blender to PATH.')
        control=Path(directory)/'inset.npz'
        np.savez(control,p=source_positions,n=s['normals'],f=s['faces'],thickness=thickness)
        subprocess.run([str(BLENDER),'--background','--factory-startup','--python',str(Path(__file__).resolve()),'--','--repair-inset',str(control)],check=True)
        with np.load(control) as repair:
            thickness=repair['thickness'].copy();repair_iterations=int(repair['iterations'])
    core=source_positions-s['normals']*thickness[:,None]
    high_core=subdivide_linear({**s,'positions':core})['positions']
    # A safe inner layer can be locally shallower than an authored fissure.
    # Constrain both interfaces together instead of allowing the core to poke
    # through the exterior. This only reduces refinement, never changes paths.
    high_original=subdivide_linear({**s,'positions':source_positions})['positions']
    gap=np.sum((high_original-high_core)*high['normals'],axis=1)
    minimum_gap=np.minimum(.04,.65*gap)
    requested_height=height.copy();height=np.maximum(height,-gap+minimum_gap)
    high['positions']=high_original+high['normals']*height[:,None]
    s['positions']=high['positions'][:original_count].copy()
    create_textures(destination,s,thickness+height[:original_count])
    destination.mkdir(parents=True,exist_ok=True);report={'source':'Dundee UL6; CT-informed educational sculpture','authored_fissure_depth_limit_mm':.14,'actual_displacement_mm_percentiles':np.percentile(height,[0,1,50,99,100]).tolist(),'native_normal_integrated_detail_mm_percentiles':np.percentile(detail,[0,1,50,99,100]).tolist(),'illustrative_layer_thickness_mm_percentiles':np.percentile(thickness,[0,1,25,50,75,99,100]).tolist(),'core_face_flips':int(bad.sum()),'global_inset_repair_iterations':repair_iterations,'lods':{}}
    report['outer_samples_with_reduced_relief_to_preserve_shell_gap']=int(np.sum(height>requested_height+1e-9))
    for label,surf,inn in [('high',high,high_core),('mobile',s,core)]:
        ec,rc=cap_partition(surf['positions'],inn,surf['uv'],surf['faces'],surf['enamel'])
        em=closed_enamel(ec);root={'p':rc['p'],'f':rc['f'],'uv':rc['uv'],'material':np.zeros(len(rc['f']),int)}
        core_mesh={'p':core-s['normals']*.008,'f':s['faces'],'uv':s['uv'],'material':np.zeros(len(s['faces']),int)}
        result={};stats={}
        for name,part in [('Enamel',em),('Cementum',root),('Dentin',core_mesh)]:
            for k,v in part.items():result[name+'_'+k]=v
            mesh=trimesh.Trimesh(part['p'],part['f'],process=True)
            stats[name]={'triangles':len(part['f']),'vertices':len(part['p']),'watertight_after_uv_weld':bool(mesh.is_watertight),'consistent_winding':bool(mesh.is_winding_consistent),'degenerate_triangles':int(np.sum(mesh.area_faces<1e-12))}
            if name in ('Enamel','Dentin'):
                assert mesh.is_watertight and mesh.is_winding_consistent and stats[name]['degenerate_triangles']==0,(name,stats[name])
        np.savez_compressed(destination/('layers-'+label+'.npz'),**result)
        report['lods'][label]=stats
    write_shell_thickness(destination)
    (destination/'layer-diagnostics.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    return report

def write_shell_thickness(destination):
    """Store the actual authored outer/inner correspondence in green channel."""
    with np.load(destination/'layers-high.npz') as arrays:
        p=arrays['Enamel_p'];count=len(p)//2;uv=arrays['Enamel_uv'][:count]
        gap=np.linalg.norm(p[:count]-p[count:],axis=1)/1.6
    size=2048;yy,xx=np.mgrid[:size,:size];query=np.column_stack([xx.ravel()/(size-1),yy.ravel()/(size-1)])
    values=LinearNDInterpolator(uv,gap)(query).reshape(size,size)
    missing=~np.isfinite(values);nearest=distance_transform_edt(missing,return_distances=False,return_indices=True)
    values=values[nearest[0],nearest[1]]
    Image.fromarray(np.repeat(np.uint8(np.clip(values,0,1)*255+.5)[:,:,None],3,axis=2)).save(destination/'enamel-thickness.png',optimize=True)

def create_textures(destination,s,thickness):
    """Author restrained physical maps in the native UV atlas; no stain paths."""
    destination.mkdir(parents=True,exist_ok=True);size=2048
    yy,xx=np.mgrid[0:size,0:size];query=np.column_stack([xx.ravel()/(size-1),yy.ravel()/(size-1)])
    data=np.column_stack([thickness,s['valley'],s['enamel'],s['normals'][:,1],s['cej_distance']])
    fields=LinearNDInterpolator(s['uv'],data,fill_value=0)(query).reshape(size,size,5)
    texroot=ROOT/'assets/source/dundee/textures'
    source=np.asarray(Image.open(texroot/'defaultMat_baseColor.png').resize((size,size)),dtype=float)/255
    mask=source[:,:,:3].max(2)>.1
    near=distance_transform_edt(~mask,return_distances=False,return_indices=True)
    source=source[near[0],near[1],:3];fields=fields[near[0],near[1]]
    lum=source.mean(2);native=lum-gaussian_filter(lum,8)
    rng=np.random.default_rng(26)
    micro=gaussian_filter(rng.normal(size=(size,size)),1.7);micro/=micro.std()
    broad=gaussian_filter(rng.normal(size=(size,size)),35);broad/=broad.std()
    # Spatially irregular gloss is intentionally authored, never described as a
    # scan. Its amplitude is small enough to avoid a gritty or dirty surface.
    enamel_rough=np.clip(.28-.04*np.clip(fields[:,:,3],0,1)+.018*np.clip(micro,-2,2)+.01*broad+.05*fields[:,:,1],.205,.34)
    root_rough=np.clip(.45+.016*np.clip(micro,-2,2)+.018*broad,.37,.53)
    enamel_color=np.ones((size,size,3))*[.949,.952,.924]
    enamel_color+=native[:,:,None]*.14+broad[:,:,None]*np.array([.002,.001,-.001])
    enamel_color-=fields[:,:,1,None]*np.array([.002,.009,.019])
    enamel_color+=helpers.smoothstep(.7,1.3,fields[:,:,0])[:,:,None]*np.array([-.004,-.001,.009])
    root_color=np.ones((size,size,3))*[.925,.890,.816]
    root_color+=native[:,:,None]*.20+broad[:,:,None]*np.array([.003,.002,.001])
    cej_color=np.array([.940,.928,.888])
    blend=helpers.smoothstep(0,.12,fields[:,:,4])[:,:,None]
    enamel_color=cej_color*(1-blend)+enamel_color*blend
    blend=helpers.smoothstep(-.12,0,fields[:,:,4])[:,:,None]
    root_color=root_color*(1-blend)+cej_color*blend
    def save(name,values):
        if values.ndim==2:values=np.repeat(values[:,:,None],3,axis=2)
        Image.fromarray(np.uint8(np.clip(values,0,1)*255+.5)).save(destination/name,optimize=True)
    save('enamel-color.png',enamel_color);save('cementum-color.png',root_color)
    save('enamel-roughness.png',enamel_rough);save('cementum-roughness.png',root_rough)
    save('enamel-thickness.png',np.clip(fields[:,:,0]/1.6,0,1))

def blender_build():
    """Create the editable layered source, then standards-based web exports."""
    import math
    destination=ROOT/'assets/source/professional';outdir=ROOT/'public/models'
    verify_layer_geometry(destination)
    if '--skip-ao' not in sys.argv:
        spec=importlib.util.spec_from_file_location('zub_occlusion',ROOT/'scripts/bake_occlusion.py')
        ao=importlib.util.module_from_spec(spec);spec.loader.exec_module(ao);ao.bake()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    def linear(rgb):return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)
    images={}
    def image_node(nodes,path,noncolor=False):
        key=(str(path),noncolor)
        if key not in images:
            im=bpy.data.images.load(str(path),check_existing=False)
            if noncolor:im.colorspace_settings.name='Non-Color'
            maximum=1024 if path.name.startswith('cementum-') else 2048
            if max(im.size)>maximum:im.scale(maximum,maximum)
            im.pack();images[key]=im
        node=nodes.new('ShaderNodeTexImage');node.image=images[key];return node
    normalpath=ROOT/'assets/source/dundee/textures/defaultMat_normal.png'
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Thickness',in_out='INPUT',socket_type='NodeSocketFloat')
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat').default_value=1
    mats={}
    for name in ['Enamel','EnamelInner','Dentin','Cementum']:
        mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.use_backface_culling=True;mat.diffuse_color=(*linear((.94,.92,.85)),1)
        n=mat.node_tree.nodes;link=mat.node_tree.links;p=n.get('Principled BSDF');out=n.get('Material Output')
        p.inputs['IOR'].default_value=1.62 if name.startswith('Enamel') else 1.54
        p.inputs['Coat Weight'].default_value=.025 if name.startswith('Enamel') else 0
        p.inputs['Coat Roughness'].default_value=.24 if name.startswith('Enamel') else .03
        p.inputs['Metallic'].default_value=0
        if name in ('Enamel','Cementum'):
            prefix='enamel' if name=='Enamel' else 'cementum'
            col=image_node(n,destination/(prefix+'-color.png'));link.new(col.outputs['Color'],p.inputs['Base Color'])
            rough=image_node(n,destination/(prefix+'-roughness.png'),True)
            channels=n.new('ShaderNodeSeparateRGB');link.new(rough.outputs['Color'],channels.inputs[0]);link.new(channels.outputs['G'],p.inputs['Roughness'])
            settings=n.new('ShaderNodeGroup');settings.node_tree=group;link.new(channels.outputs['R'],settings.inputs['Occlusion'])
            normal=image_node(n,normalpath,True);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.62 if name=='Enamel' else .80
            link.new(normal.outputs['Color'],nm.inputs['Color']);link.new(nm.outputs['Normal'],p.inputs['Normal'])
        else:
            p.inputs['Base Color'].default_value=(*linear((.949,.952,.924) if name=='EnamelInner' else (.948,.900,.797)),1)
            p.inputs['Roughness'].default_value=.25 if name=='EnamelInner' else .39
        if name.startswith('Enamel'):
            p.inputs['Transmission Weight'].default_value=.30
            vol=n.new('ShaderNodeVolumeAbsorption');vol.inputs['Color'].default_value=(.96,.92,.78,1);vol.inputs['Density'].default_value=1/.0035
            link.new(vol.outputs['Volume'],out.inputs['Volume'])
            if name=='EnamelInner':settings=n.new('ShaderNodeGroup');settings.node_tree=group
            thick=image_node(n,destination/'enamel-thickness.png',True)
            mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=.0016
            link.new(thick.outputs['Color'],mul.inputs[0]);link.new(mul.outputs[0],settings.inputs['Thickness'])
        if name=='Dentin':
            p.inputs['Subsurface Weight'].default_value=.13
            p.inputs['Subsurface Scale'].default_value=.0005
            p.inputs['Subsurface Radius'].default_value=(1,.6,.3)
        mat['description']='Authored optical presentation; tissue geometry is illustrative, not measured segmentation.'
        mats[name]=mat
    collections={}
    for label in ['high','mobile']:
        arrays=np.load(destination/('layers-'+label+'.npz'))
        # Lighting normals follow the continuous exterior across the CEJ. The
        # artificial closure rim must not create a reflective lip on that skin.
        ep=arrays['Enamel_p'];ef=arrays['Enamel_f'];half=len(ep)//2
        rp=arrays['Cementum_p'];rf=arrays['Cementum_f']
        exterior_faces=ef[np.all(ef<half,axis=1)]
        exterior_normals=welded_angle_normals(np.vstack([ep[:half],rp]),np.vstack([exterior_faces,rf+half]))
        inside_normals=welded_angle_normals(ep[half:],ef[np.all(ef>=half,axis=1)]-half)
        normal_fields={'Enamel':np.vstack([exterior_normals[:half],inside_normals]),'Cementum':exterior_normals[half:],'Dentin':welded_angle_normals(arrays['Dentin_p'],arrays['Dentin_f'])}
        collection=bpy.data.collections.new('HD anatomy' if label=='high' else 'Mobile anatomy');bpy.context.scene.collection.children.link(collection);collections[label]=collection
        for name in ['Dentin','Cementum','Enamel']:
            points=arrays[name+'_p'].copy()/1000
            points=points[:,[0,2,1]];points[:,1]*=-1 # Blender Z up; exporter returns glTF Y up.
            faces=arrays[name+'_f'];uv=arrays[name+'_uv'].copy();uv[:,1]=1-uv[:,1]
            mesh=bpy.data.meshes.new(name+'_'+label);mesh.from_pydata(points.tolist(),[],faces.tolist());mesh.update()
            obj=bpy.data.objects.new(name+'_'+label,mesh);collection.objects.link(obj)
            mesh.materials.append(mats[name])
            if name=='Enamel':mesh.materials.append(mats['EnamelInner'])
            mesh.polygons.foreach_set('use_smooth',np.ones(len(faces),bool))
            mesh.polygons.foreach_set('material_index',arrays[name+'_material'].astype(np.int32))
            normal=normal_fields[name][:,[0,2,1]].copy();normal[:,1]*=-1
            mesh.normals_split_custom_set_from_vertices(normal.tolist())
            uv_layer=mesh.uv_layers.new(name='Native Dundee UV')
            uv_layer.data.foreach_set('uv',uv[faces.reshape(-1)].reshape(-1))
            obj['source']='University of Dundee Maxillary First Molar, CC BY 4.0'
            obj['tissue_layer']='Illustrative anatomical presentation, not measured tissue segmentation'
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene['physical_scale']='Illustrative nominal 21 mm height; original source is not metrically calibrated.'
    scene['geometry_notes']='Native anatomical silhouette; bounded concavity anchored fissure refinement; source-normal integration; authored enamel and dentin tissue layers.'
    scene['license']='Creative Commons Attribution 4.0 International: https://creativecommons.org/licenses/by/4.0/'
    scene['original_source']='https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984'
    scene['attribution']='University of Dundee School of Dentistry. Emily McDougall; Dr Andrew Mason; Mark Roughley. Adapted geometry and optical presentation for ZUB-3D.'
    original_images={node:node.image for mat in mats.values() for node in mat.node_tree.nodes if node.type=='TEX_IMAGE'}
    mobile_images={}
    for label,collection in collections.items():
        if label=='mobile':
            for node,im in original_images.items():
                if im.name not in mobile_images:
                    small=im.copy();small.name=im.name+' mobile 1024';small.scale(1024,1024);small.pack();mobile_images[im.name]=small
                node.image=mobile_images[im.name]
        for c in collections.values():
            for obj in c.objects:obj.select_set(False)
        for obj in collection.objects:obj.select_set(True)
        path=outdir/('molar.glb' if label=='high' else 'molar-mobile.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_yup=True,export_extras=True,export_copyright='University of Dundee School of Dentistry; Emily McDougall; Andrew Mason; Mark Roughley. CC BY 4.0. Source https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984. Tissue layers and optical presentation adapted for ZUB-3D.',export_image_format='AUTO')
        print('Exported',path,path.stat().st_size)
    for node,im in original_images.items():node.image=im
    collections['mobile'].hide_render=True;collections['mobile'].hide_viewport=True
    bpy.ops.wm.save_as_mainfile(filepath=str(destination/'molar-professional.blend'),compress=True)

def welded_angle_normals(points,faces):
    """Continuous physical normals while retaining original indexed UV seams."""
    _,inverse=np.unique(np.round(points,7),axis=0,return_inverse=True)
    triangles=points[faces];cross=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]);unit=cross/np.linalg.norm(cross,axis=1)[:,None]
    normals=np.zeros((inverse.max()+1,3))
    for corner in range(3):
        first=triangles[:,(corner+1)%3]-triangles[:,corner];second=triangles[:,(corner+2)%3]-triangles[:,corner]
        angle=np.arctan2(np.linalg.norm(np.cross(first,second),axis=1),np.sum(first*second,axis=1))
        np.add.at(normals,inverse[faces[:,corner]],unit*angle[:,None])
    normals/=np.linalg.norm(normals,axis=1)[:,None]
    return normals[inverse]

def verify_layer_geometry(destination):
    """Refuse to export globally invalid tissue layers after any future edit."""
    spec=importlib.util.spec_from_file_location('zub_geometry_audit',ROOT/'scripts/audit_layer_geometry.py')
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    for lod in ['high','mobile']:
        with np.load(destination/('layers-'+lod+'.npz')) as arrays:
            ep=arrays['Enamel_p'];ef=arrays['Enamel_f'];dp=arrays['Dentin_p'];df=arrays['Dentin_f'];rp=arrays['Cementum_p'];rf=arrays['Cementum_f']
        half=len(ep)//2;outer_faces=ef[np.all(ef<half,axis=1)];inner_faces=ef[np.all(ef>=half,axis=1)]-half
        for name,p,f in [('Enamel',ep,ef),('Dentin',dp,df)]:
            topo=audit.topology(p,f);report,_=audit.self_intersections(p,f)
            assert topo['boundary_edges']==0 and topo['nonmanifold_edges']==0 and topo['degenerate_faces_area_below_1e-12_mm2']==0,(lod,name,topo)
            assert report['nonadjacent_triangle_pairs']==0,(lod,name,report)
        outside=audit.tree(np.vstack([ep[:half],rp]),np.vstack([outer_faces,rf+half]));core=audit.tree(dp,df);inside=audit.tree(ep[half:],inner_faces)
        assert not core.overlap(outside),(lod,'Dentin intersects exterior')
        assert not core.overlap(inside),(lod,'Dentin intersects enamel inner interface')
        print('Verified complete layer geometry',lod,flush=True)

def repair_inset(path):
    """Conservatively constrain the core to a non-self-intersecting inset."""
    from mathutils.bvhtree import BVHTree
    arrays=np.load(path);original=arrays['p'];normals=arrays['n'];faces=arrays['f'];thickness=arrays['thickness']
    _,index,inverse=np.unique(np.round(original,7),axis=0,return_index=True,return_inverse=True)
    p=original[index];n=normals[index];f=inverse[faces];t=thickness[index].copy()
    edges=np.unique(np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1),axis=0)
    original_fn=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    def bvh(q):return BVHTree.FromPolygons(q.tolist(),f.tolist(),all_triangles=True,epsilon=0)
    def conflicts(tree):
        return np.asarray([(a,b) for a,b in tree.overlap(tree) if a<b and not set(f[a]).intersection(f[b])],dtype=int).reshape(-1,2)
    for iteration in range(30):
        inner=p-n*t[:,None];dentin=p-n*(t+.008)[:,None]
        it=bvh(inner);dt=bvh(dentin);ci=conflicts(it);cd=conflicts(dt)
        between=np.asarray(dt.overlap(it),dtype=int).reshape(-1,2)
        fn=np.cross(inner[f[:,1]]-inner[f[:,0]],inner[f[:,2]]-inner[f[:,0]])
        flipped=np.where(np.sum(original_fn*fn,axis=1)<=0)[0]
        print('Inset repair',iteration,'inner self',len(ci),'core self',len(cd),'interfaces',len(between),'flips',len(flipped),flush=True)
        if not(len(ci)+len(cd)+len(between)+len(flipped)):break
        face_ids=np.unique(np.concatenate([ci.reshape(-1),cd.reshape(-1),between.reshape(-1),flipped]))
        affected=np.zeros(len(p),bool);affected[np.unique(f[face_ids])]=True
        factor=np.ones(len(p));factor[affected]=.70
        for amount in [.82,.94]:
            affected[np.unique(edges[affected[edges].any(1)])]=True
            factor[affected]=np.minimum(factor[affected],amount)
        t*=factor
    else:raise RuntimeError('Global tissue inset constraints failed to converge')
    np.savez(path,thickness=t[inverse],iterations=iteration)

def write_provenance():
    source=json.loads((ROOT/'assets/source/dundee/source-provenance.json').read_text())
    layer_report=json.loads((ROOT/'assets/source/professional/layer-diagnostics.json').read_text())
    outputs={}
    for name in ['molar.glb','molar-mobile.glb']:
        path=ROOT/'public/models'/name;doc,blob=helpers.read_glb(path);textures=[];triangles=0;vertices=0
        for mesh in doc['meshes']:
            for primitive in mesh['primitives']:
                triangles+=doc['accessors'][primitive['indices']]['count']//3
                vertices+=doc['accessors'][primitive['attributes']['POSITION']]['count']
        for item in doc.get('images',[]):
            view=doc['bufferViews'][item['bufferView']];start=view.get('byteOffset',0)
            image=Image.open(io.BytesIO(blob[start:start+view['byteLength']]))
            textures.append({'name':item['name'],'width':image.width,'height':image.height,'embedded_bytes':view['byteLength']})
        outputs[name]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':triangles,'primitive_vertices_with_seams':vertices,'embedded_textures':textures,'rgba8_texture_memory_mib':sum(x['width']*x['height']*4 for x in textures)/1048576,'rgba8_texture_memory_with_mips_mib':sum(x['width']*x['height']*4 for x in textures)*4/3/1048576,'gltf_extensions':doc.get('extensionsUsed',[]),'identity_mesh_transforms':True}
        fingerprints={}
        for mesh in doc['meshes']:
            for ordinal,primitive in enumerate(mesh['primitives']):
                attrs={**primitive['attributes'],'INDICES':primitive['indices']}
                fingerprints[mesh['name']+':'+str(ordinal)]={key:hashlib.sha256(helpers.accessor(doc,blob,index).tobytes()).hexdigest() for key,index in attrs.items()}
        outputs[name]['geometry_attribute_sha256']=fingerprints
    npz=np.load(ROOT/'assets/source/professional/layers-high.npz');p=npz['Enamel_p'];count=len(p)//2;gaps=np.linalg.norm(p[:count]-p[count:],axis=1)
    blend=ROOT/'assets/source/professional/molar-professional.blend'
    metadata={'model':'Permanent maxillary LEFT FIRST molar, FDI 26 / UL6, three native roots','source':source,
      'processing':[
       'Read immutable Dundee glTF, preserve native crown/root anatomy and native UV atlas; discard original display vertex colors.',
       'Orient crown +Y, recenter, normalize full tooth height to an illustrative 21 mm, then bake metre-space coordinates with identity node transforms.',
       'Weld seam duplicates only for physical normal, boundary and offset calculations. Preserve UV coordinates on render vertices.',
       'Use angle-weighted shading normals from the continuous combined enamel/cementum exterior. Compute inner-interface and dentin normals independently, excluding the artificial cervical rim from exterior normal averaging.',
       'Linearly subdivide native triangles once for HD displacement sampling. The mobile exterior retains native face density.',
       'Integrate the native baked normal tangent slopes using a screened surface Poisson solve; no claim of recovering measured microCT geometry.',
       'Estimate and smooth concavity from native geometric normal changes. Deepen only existing upward-facing occlusal concavities by at most 0.14 mm. No new fissure path is drawn across ridges.',
       'Infer the crown-root contour from source painted color. Clip along that contour; create exterior, reversed inner cap and closed cervical rim for enamel.',
       'Author a varying inward dentin interface and taper it near the cervical contour. Adaptively reduce intersecting offsets and their two neighbor rings using a welded Blender BVH check.',
       'Locally reduce exterior relief where needed to maintain a positive shell gap after the safe inward offsets are determined.',
       'Create a closed dentin core separated by 8 micrometres from the enamel inner interface; root cementum is an opaque exterior cap, not a separately closed biological volume.',
       'Author pale enamel, cream cementum, muted dentin colors and restrained source-valley/cusp coloration. Add explicitly synthetic low-amplitude gloss variation, not claimed as measured detail.',
       'Use source baked normal detail at reduced residual strength. Export normal at 2048 pixels for HD; root maps at1024, enamel maps at2048. All mobile textures1024.',
       'Bake restrained short-range geometric ambient visibility from the combined exterior only; pack it in R alongside roughness G. This is occlusion, not painted stains.',
       'Export uncompressed standard GLB with embedded textures, normals, tangents, UVs and CC BY4 attribution; save an editable packed Blender file.'
      ],'nominal_height_metres':.021,'layer_diagnostics':layer_report,'enamel_shell_gap_mm_percentiles':{'percentiles':[0,1,10,50,90,99,100],'values':np.percentile(gaps,[0,1,10,50,90,99,100]).tolist()},
      'materials':{'Enamel':{'ior':1.62,'transmission':.30,'clearcoat':.025,'roughness_cusp_side_valley_targets':[.24,.28,.31],'thickness_factor_metres':.0016,'thickness_texture_channel':'G','attenuation_distance_metres':.0035,'attenuation_color_linear':[.96,.92,.78]},'EnamelInner':{'ior':1.62,'transmission':.30,'roughness':.25,'closed_inner_interface':True},'Dentin':{'base_color_srgb':[.948,.900,.797],'roughness':.39,'cycles_subsurface_weight':.13,'subsurface_exported_in_gltf':False},'Cementum':{'base_color_srgb':[.925,.890,.816],'roughness_mean':.45},'scale_contract':'Positions are nominal metres. Three.js viewer rescales attenuationDistance once by its presentation normalization; the world matrix already rescales thicknessFactor.'},
      'outputs':outputs,'editable_blender':{'path':'assets/source/professional/molar-professional.blend','bytes':blend.stat().st_size,'sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'blender_version':'4.5.14 LTS'},
      'limitations':['CT-informed ZBrush educational source, not a raw high-resolution microCT specimen.','Dentin and enamel segmentation, enamel thickness and source scale are authored illustrations, not patient measurements.','No clinical validation; not suitable for diagnosis or treatment planning.','Three.js screen-space transmission is approximate. The web Dentin shader blends 18 percent wrapped diffuse only into punctual/directional direct lighting; RectArea LTC and image-based lighting are unchanged. This is not full volumetric subsurface scattering. The Blender Cycles source has a separate subsurface dentin material.','Web texture LODs reduce source normal resolution. Fine fissure anatomy remains limited by the original reconstruction.','Global intersection audits exclude pairs sharing a welded vertex and do not certify medical validity.']}
    metadata['materials']['Dentin']['web_scattering_approximation']={'wrapped_diffuse_fraction':.18,'applies_to':'Punctual and directional direct lighting only','does_not_modify':['RectArea LTC lighting','image-based lighting'],'full_volumetric_sss':False}
    ao=ROOT/'assets/source/professional/occlusion-bake.json'
    if ao.exists():metadata['ambient_occlusion_bake']=json.loads(ao.read_text())
    (ROOT/'public/models/provenance.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({name:{key:info[key] for key in ['bytes','sha256','triangles','rgba8_texture_memory_with_mips_mib']} for name,info in outputs.items()},indent=2))

def diagnostics(surface,destination):
    p=surface['positions']; f=surface['faces']; mesh=trimesh.Trimesh(p,f,process=False)
    welded=trimesh.Trimesh(p,f,process=True)
    normal=surface['normal_sample']; angle=np.degrees(np.arccos(np.clip(normal[:,2],-1,1)))
    crown=surface['enamel']>.65
    occ=crown&(surface['normals'][:,1]>.3)&(p[:,1]>3)
    edges=welded.edges_unique; delta=np.zeros_like(welded.vertices);sq=np.zeros(len(delta))
    dv=welded.vertices[edges[:,1]]-welded.vertices[edges[:,0]]
    np.add.at(delta,edges[:,0],dv);np.add.at(delta,edges[:,1],-dv)
    d2=(dv*dv).sum(1);np.add.at(sq,edges[:,0],d2);np.add.at(sq,edges[:,1],d2)
    curvature=np.sum(delta*welded.vertex_normals,axis=1)/np.maximum(sq,1e-12)
    summary={'bounds_mm':mesh.bounds.tolist(),'dimensions_mm':mesh.extents.tolist(),'vertices_with_uv_seam':len(p),'welded_vertices':len(welded.vertices),'triangles':len(f),'watertight_after_uv_weld':bool(welded.is_watertight),'winding_consistent':bool(welded.is_winding_consistent),'components':len(welded.split(only_watertight=False)), 'volume_mm3':float(welded.volume),'edge_lengths_mm_percentiles':np.percentile(np.sqrt(d2),[1,25,50,75,95,99]).tolist(),'enamel_vertex_count':int(crown.sum()),'occlusal_vertex_count':int(occ.sum()),'enamel_y_range_mm':[float(p[crown,1].min()),float(p[crown,1].max())],'normal_angle_degrees_percentiles':{},'normal_slope_rms':{},'curvature_per_mm_percentiles':np.percentile(curvature,[1,25,50,75,99]).tolist()}
    for label,mask in [('all',np.ones(len(p),bool)),('enamel',crown),('occlusal',occ),('roots',~crown)]:
        summary['normal_angle_degrees_percentiles'][label]=np.percentile(angle[mask],[0,25,50,75,95,99,100]).tolist()
        summary['normal_slope_rms'][label]=float(np.sqrt(np.mean(np.sum(normal[mask,:2]**2,axis=1))))
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'mesh-diagnostics.json').write_text(json.dumps(summary,indent=2))
    np.savez_compressed(destination/'source-surface.npz',**{k:v for k,v in surface.items() if isinstance(v,np.ndarray)})
    print(json.dumps(summary,indent=2))

if __name__=='__main__' and not IN_BLENDER:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnostics',type=Path,default=ROOT.parent/'research-models/professional')
    parser.add_argument('--prepare',action='store_true')
    parser.add_argument('--metadata',action='store_true')
    args=parser.parse_args()
    if args.prepare:prepare_layers(ROOT/'assets/source/professional')
    elif args.metadata:write_provenance()
    else:diagnostics(source_surface(),args.diagnostics)
elif __name__=='__main__':
    if '--repair-inset' in sys.argv:
        repair_inset(Path(sys.argv[sys.argv.index('--repair-inset')+1]))
    else:blender_build()
