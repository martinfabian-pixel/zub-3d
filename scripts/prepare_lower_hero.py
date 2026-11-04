"""Preserve native Dundee mandibular first molar 36 for the interactive page.

Run: python scripts/prepare_lower_hero.py
Dependencies: scripts/requirements-dentition.txt and Blender 4.5 LTS for AO.
Only hero-36*.glb / hero-36-provenance.json are written. Atlas/prototype assets
and the placement manifest are inputs, and their hashes are checked afterwards.
"""
from pathlib import Path
import hashlib,io,json,os,shutil,struct,subprocess,tempfile
import numpy as np
from PIL import Image
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import distance_transform_edt,gaussian_filter
import trimesh
import prepare_dentition as dent
import prepare_prototype as prototype

ROOT=dent.ROOT;OUT=dent.OUT;SRC=dent.SRC
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def tangent_frame(p,n,uv,faces):
    """Original mesh lacks tangents. Recover a UV-aligned orthonormal basis."""
    tri=p[faces];tuv=uv[faces];ab=tri[:,1]-tri[:,0];ac=tri[:,2]-tri[:,0];du=tuv[:,1]-tuv[:,0];dv=tuv[:,2]-tuv[:,0]
    determinant=du[:,0]*dv[:,1]-du[:,1]*dv[:,0];den=np.zeros(len(faces));valid=abs(determinant)>1e-12;den[valid]=1/determinant[valid]
    u=dent.norm((ab*dv[:,1,None]-ac*du[:,1,None])*den[:,None]);v=dent.norm((ac*du[:,0,None]-ab*dv[:,0,None])*den[:,None]);T=np.zeros_like(p);B=np.zeros_like(p)
    for corner in range(3):
        a=tri[:,(corner+1)%3]-tri[:,corner];b=tri[:,(corner+2)%3]-tri[:,corner];w=np.arctan2(np.linalg.norm(np.cross(a,b),axis=1),np.sum(a*b,axis=1));np.add.at(T,faces[:,corner],u*w[:,None]);np.add.at(B,faces[:,corner],v*w[:,None])
    T-=n*np.sum(n*T,axis=1)[:,None];missing=np.linalg.norm(T,axis=1)<1e-8;axis=np.zeros((missing.sum(),3));axis[:,0]=1;axis[np.abs(n[missing,0])>.8]=[0,1,0];T[missing]=np.cross(axis,n[missing]);T=dent.norm(T);hand=np.where(np.sum(np.cross(n,T)*B,axis=1)<0,-1,1)
    return np.column_stack([T,hand])

def regions(s,paint,ao):
    # Same material contract as the approved hero, using this tooth's own UVs,
    # colors, signed cervical distance, normals and native geometry visibility.
    size=2048;y,x=np.mgrid[:size,:size];q=np.column_stack([x.ravel()/(size-1),y.ravel()/(size-1)]);curv,_=prototype.anatomy.source_curvature(s);distance=prototype.anatomy.cervical_distance(s)
    fields=LinearNDInterpolator(s['uv'],np.column_stack([distance,s['normals'][:,1],curv,ao]))(q).reshape(size,size,4)
    rgb=np.asarray(paint.resize((size,size),Image.Resampling.LANCZOS),float)/255;valid=(rgb.max(2)>.12)&np.isfinite(fields).all(2);nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True);rgb=rgb[nearest[0],nearest[1]];fields=fields[nearest[0],nearest[1]]
    crown=dent.smooth(-.10,.10,fields[:,:,0]);up=np.clip(fields[:,:,1],0,1);valley=dent.smooth(.04,.30,fields[:,:,2])*up;lum=rgb.mean(2);tone=np.clip((lum-gaussian_filter(lum,18))/.055,-1,1);rough=np.clip((.49+.008*tone)*(1-crown)+(.29-.025*up+.025*valley+.008*tone)*crown,.24,.51)
    return Image.fromarray(np.uint8(np.clip(np.stack([crown,rough,.5+.20*tone,np.clip(fields[:,:,3],.4,1)],axis=2),0,1)*255+.5),'RGBA')

def store(path,model,params,source):
    # The atlas writer is reused only as a buffer serializer. Its single new
    # mesh/material is named explicitly and credited to the actual FDI36 source.
    flat_normal=dent.as_png(Image.new('RGB',(1,1),(128,128,255)))
    with tempfile.TemporaryDirectory(prefix='zub-lower-pack-') as directory:
        packed=Path(directory)/'surface.glb';dent.write_atlas(packed,[(36,{**model,'packedUv':model['uv']})],dent.as_png(params),flat_normal);doc,bin=dent.glb(packed)
    doc['asset'].update(generator='ZUB-3D native mandibular first molar detail',copyright='Mandibular First Molar — University of Dundee, School of Dentistry. Emily McDougall; Dr Andrew Mason; Mark Roughley. CC BY 4.0. '+source['url']+'. Canonical pose, derived material maps, unchanged exterior triangulation.')
    doc['asset']['extras'].update(source=source['url'],fdi=36)
    for section in ['nodes','meshes','materials']:doc[section][0]['name']='ToothExterior'
    doc['materials'][0]['normalTexture']['scale']=0;doc['materials'][0]['pbrMetallicRoughness']['baseColorFactor']=[.90,.88,.82,1]
    doc['images'][0]['name']='Neutral tangent normal — source has no baked normal map';doc['images'][1]['name']='Native UV tissue parameters';doc['materials'][0]['extras']['normalMapNote']='Neutral 1×1 compatibility map; source authored vertex normals retained. Browser micro-normal variation is illustrative.'
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);out=struct.pack('<III',0x46546c67,2,28+len(j)+len(bin))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(bin),0x004e4942)+bin;path.write_bytes(out)
    pr=doc['meshes'][0]['primitives'][0];attrs={**pr['attributes'],'INDICES':pr['indices']}
    return {'bytes':len(out),'sha256':dent.sha(out),'vertices':len(model['p']),'triangles':len(model['f']),'texture_size':params.width,'parameterTextureSize':list(params.size),'normalTextureSize':[1,1], 'geometry_sha256':{key:dent.sha(dent.accessor(doc,bin,index).tobytes()) for key,index in attrs.items()},'rgba8_texture_memory_with_mips_mib':(params.width*params.height*4*4/3+4)/1048576}

def main():
    source=next(x for x in json.loads((SRC/'sources.json').read_text()) if x['source']==36);protected=[OUT/'manifest.json',OUT/'dentition.glb',OUT/'dentition-mobile.glb',SRC/source['file'],ROOT/'public/prototype-assets/molar.glb',ROOT/'public/prototype-assets/molar-mobile.glb',ROOT/'public/models/molar.glb',ROOT/'public/models/molar-mobile.glb'];snapshot={str(p.relative_to(ROOT)).replace('\\','/'):digest(p) for p in protected}
    ref=json.loads((SRC/'placement-28.json').read_text());model=dent.decode(source,ref['teeth']['36'],dent.hero(ref)['scale']);p,n,uv,f=model['p'],model['n'],model['uv'],model['f'];model['t']=tangent_frame(p,n,uv,f)
    manifest=json.loads((OUT/'manifest.json').read_text());expected=next(t for t in manifest['teeth'] if t['fdi']==36);assert np.allclose(np.r_[p.min(0),p.max(0)],expected['bounds'],rtol=0,atol=2e-12)
    j,b=dent.glb(SRC/source['file']);pr=j['meshes'][0]['primitives'][0];material=j['materials'][pr.get('material',0)];assert 'normalTexture' not in material and 'TANGENT' not in pr['attributes'];paint=dent.tex(j,b,material['pbrMetallicRoughness']['baseColorTexture']['index'])
    assert len(f)==j['accessors'][pr['indices']]['count']//3 and len(p)==j['accessors'][pr['attributes']['POSITION']]['count'];m=trimesh.Trimesh(p*1000,f,process=True);assert m.is_watertight and m.is_winding_consistent and len(m.split())==1 and m.volume>0
    if not prototype.BLENDER.is_file():raise FileNotFoundError('Set BLENDER_BIN or add Blender to PATH.')
    with tempfile.TemporaryDirectory(prefix='zub-lower-visibility-') as directory:
        stage=Path(directory)/'rays.npz';np.savez(stage,p=p*1000,n=n,f=f);subprocess.run([str(prototype.BLENDER),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/prepare_prototype.py'),'--','--visibility',str(stage)],check=True)
        with np.load(stage) as data:ao=data['visibility'].copy()
    params=regions({'positions':p*1000,'normals':n,'faces':f,'uv':uv,'enamel':model['mask']},paint,ao);outputs={}
    for filename,size in [('hero-36.glb',2048),('hero-36-mobile.glb',1024)]:
        im=params if size==2048 else params.resize((size,size),Image.Resampling.LANCZOS);outputs[filename]=store(OUT/filename,model,im,source)
    assert outputs['hero-36.glb']['geometry_sha256']==outputs['hero-36-mobile.glb']['geometry_sha256']
    assert all(digest(ROOT/k)==v for k,v in snapshot.items())
    provenance={'model':'Mandibular left first permanent molar, FDI 36 (LL6); reflected counterpart FDI 46','source':source,'contributors':{'creator':'Emily McDougall','contentExpert':'Dr. Andrew Mason','initial3DPreparation':'Mark Roughley','institution':'University of Dundee, School of Dentistry'},'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','geometry':{'vertices':len(p),'triangles':len(f),'physicalRootBranches':2,'nativeTopologyRetained':True,'deformationOrSubdivision':False,'nativeAuthoredNormalsRetained':True,'nativeUvsRetained':True,'canonicalFrame':'Exactly the pre-decimation FDI_36 frame; local metres, +Y crown, +Z buccal. Apply existing manifest Matrix4 directly for FDI36 or reflected46.','bounds':np.r_[p.min(0),p.max(0)].tolist(),'watertightAfterUvWeld':bool(m.is_watertight),'windingConsistent':bool(m.is_winding_consistent),'componentCount':len(m.split()),'weldedVertices':len(m.vertices)},'material':{'opaque':True,'transmission':0,'ior':1.62,'sourcePaintResolution':list(paint.size),'normalTexture':'Source has native vertex normals but no baked normal texture or tangent accessor. Export includes a neutral 1×1 RGB compatibility map and an orthogonal tangent basis calculated from original UV derivatives. No measured microsurface normal data is invented.','channels':{'R':'Enamel mask; 0.2 mm inferred cervical transition.','G':'Absolute authored roughness.','B':'Source-painted tone variation centered at 0.5.','A':'40-ray geometric hemisphere visibility at nominal 0.65 mm range.'}},'outputs':outputs,'protectedSha256Unchanged':snapshot,'limitations':['Educational ZBrush reconstruction, not a raw microCT specimen or a clinically validated tooth.','Source colors, inferred tissue boundary, optics and nominal size are visualization approximations.','Both LODs retain the full source triangle count. Only the packed parameter resolution differs.']}
    (OUT/'hero-36-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8');print(json.dumps({k:{a:v[a] for a in ['bytes','sha256','vertices','triangles','texture_size']} for k,v in outputs.items()},indent=2))

if __name__=='__main__':main()
