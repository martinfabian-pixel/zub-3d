"""Independent read-only BVH, topology, orientation, and macro-camera audit of shipped sparse FDI36 morph.
Blender 4.5 LTS --background --factory-startup --python morph-geometry-audit.py
"""
from pathlib import Path
import hashlib,itertools,json,struct,subprocess
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parent;WORK=OUT.parents[3];REPO=OUT.parents[2];PUB=REPO/'public';DENT=PUB/'dentition-assets';STORY=PUB/'story-assets';BASELINE='333c359'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def unit(a):return a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-28)
def tx(M,p):return p@M[:3,:3].T+M[:3,3]
def vol(p,f):
    pp=p-p.mean(0);t=pp[f];return float(np.sum(t[:,0]*np.cross(t[:,1],t[:,2]))/6)
def cross(p,f):return np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
def glb(path):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);buf=b[28+n:]
    def acc(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],w),dt,buf,v.get('byteOffset',0)+a.get('byteOffset',0),(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy()
    out={}
    for nd in j['nodes']:
        if 'mesh' not in nd:continue
        assert not any(k in nd for k in ['matrix','translation','rotation','scale']);pr=j['meshes'][nd['mesh']]['primitives'][0];a=pr['attributes'];attrs={k:acc(i) for k,i in {**a,'INDICES':pr['indices']}.items()};out[nd['name']]={'p':attrs['POSITION'],'n':attrs['NORMAL'],'f':attrs['INDICES'].reshape(-1,3),'hashes':{k:hashlib.sha256(s.tobytes()).hexdigest() for k,s in attrs.items()}}
    return out
def tree(p,f):return {'bv':BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0),'p':p,'f':f,'lo':p.min(0),'hi':p.max(0)}
def inter(a,b):return [] if np.any(a['hi']<b['lo']) or np.any(b['hi']<a['lo']) else a['bv'].overlap(b['bv'])
def compact_topology(p,f):
    unique,first,inv=np.unique(p,axis=0,return_index=True,return_inverse=True);wf=inv[f];edges=np.concatenate([wf[:,[0,1]],wf[:,[1,2]],wf[:,[2,0]]]);se=np.sort(edges,axis=1);_,ei,counts=np.unique(se,axis=0,return_inverse=True,return_counts=True);sign=np.where(edges[:,0]==se[:,0],1,-1);orient=np.bincount(ei,weights=sign,minlength=len(counts));return first,inv,wf,{'welded_vertices':len(unique),'triangles':len(f),'boundary_edges':int(np.sum(counts==1)),'nonmanifold_edges':int(np.sum(counts>2)),'inconsistent_manifold_edges':int(np.sum((counts==2)&(orient!=0)))}
def selfcheck(p,wf):
    tr=BVHTree.FromPolygons(p.tolist(),wf.tolist(),all_triangles=True,epsilon=0);pairs=tr.overlap(tr);bad=[]
    for i,j in pairs:
        if i>=j:continue
        if not set(wf[i]).intersection(wf[j]):bad.append((int(i),int(j)))
    return {'nonadjacent_intersecting_triangle_pairs':len(bad),'first_pairs':bad[:8]}
def bary(p,t):
    b=np.linalg.lstsq(np.array([t[1]-t[0],t[2]-t[0]]).T,p-t[0],rcond=None)[0];return np.array([1-b.sum(),b[0],b[1]])
def visible(p,n,C,cohort):
    # Reverse ray from the actual surface, with only 0.0001mm epsilon for numerical self-hit avoidance.
    L=unit(C-p);cos=float(n@L);o=p+n*1e-5;d=unit(C-o);length=float(np.linalg.norm(C-o));hits=[]
    for i,k in cohort.items():
        loc,_,tri,dist=k['bv'].ray_cast(Vector(o),Vector(d),length)
        if loc is not None:hits.append((float(dist),int(i),int(tri)))
    hits.sort();return {'visible':cos>0 and not hits,'geometricNormalDotView':cos,'closestOccludingFdi':hits[0][1] if hits else None,'hitDistanceFromSurfaceMm':hits[0][0]*10 if hits else None}
def immutable():
    paths=['public/dentition-assets','public/prototype-assets','public/models','assets/source/dentition','assets/source/dundee'];git=lambda args:subprocess.check_output(['git','-C',str(REPO),*args]);diff=git(['diff','--name-only',BASELINE,'--',*paths]).decode().splitlines();extra=git(['ls-files','--others','--exclude-standard','--',*paths]).decode().splitlines();same={}
    for p in [DENT/'manifest.json',*sorted(DENT.glob('*.glb')),*sorted((PUB/'prototype-assets').glob('*.glb'))]:
        path=p.relative_to(REPO).as_posix();blob=git(['show',BASELINE+':'+path]);same[path]={'worktreeSha256':sha(p),'baselineSha256':hashlib.sha256(blob).hexdigest(),'byteIdentical':p.read_bytes()==blob}
    return {'baselineCommit':git(['rev-parse',BASELINE]).decode().strip(),'protectedPaths':paths,'gitDifferencesAgainstBaseline':diff,'untrackedWithinProtectedPaths':extra,'deliveredMeshAndManifestComparisons':same}
site=json.loads((STORY/'site.json').read_bytes());morph=json.loads((STORY/'caries-36.json').read_bytes());man=json.loads((DENT/'manifest.json').read_bytes());items={x['fdi']:x for x in man['teeth']};cam=np.array(site['lesion']['macroCamera']['cameraWorldCmAt31mm']);focal=np.array(site['lesion']['centerWorldCm']);rawIds=np.asarray(morph['indices']);region=np.asarray(morph['region']).reshape(-1,4);assert len(set(rawIds))==len(rawIds) and rawIds.min()>=0 and rawIds.max()<morph['vertexCount']
report={'method':'Read exact committed-source GLB accessor arrays and actual public sparse morph JSON independently of any preparation code. Only FDI36 gets relative POSITION/NORMAL deltas. The mirrored 46 instance stays healthy. Five discrete shape samples; no assertion of mathematical collision certification at every real-valued morph influence. Mesh BVH epsilon zero. Same-arch and cross-arch tests include all 28 actual LOD-specific geometry instances and their final poses. No brush/plaque, shadows or soft tissue included.','currentSourceFiles':{k:sha(STORY/k) for k in ['caries-36.json','site.json']},'immutableAssets':immutable(),'geometry':{},'lods':{},'cameraWorldCm':cam.tolist(),'lookAtWorldCm':focal.tolist(),'visibilityMethod':'From actual morphed surface sampled points, ray to site macro perspective camera at 31mm with 0.0001mm outward origin offset. Check all 28 teeth for occluders and require positive geometric face dot camera. For vertex use native interpolated shading normal at that vertex; also test interior centroids/floor areas. No wide claim of universal visibility; adjacent hidden walls can be legitimate self-occlusion of a real concavity.','selfIntersectionMethod':'All FDI36 exterior triangles tested by global Blender BVHTree.overlap with positional UV seams welded first. Discard each identical or adjacent face pair (share any welded vertex); report distinct unordered pairs only. Same exclusions as previous reference audit.'}
for lod,suffix in [('desktop',''),('mobile','-mobile')]:
    files=[('atlas',DENT/('dentition'+suffix+'.glb')),('upper',PUB/'prototype-assets'/('molar'+suffix+'.glb')),('lower',DENT/('hero-36'+suffix+'.glb'))];assets={k:glb(p) for k,p in files};origins={};cache={};M36=None
    for i,it in items.items():
        source=it['source'];m=assets['lower' if source==36 else ('upper' if source==26 else 'atlas')]['ToothExterior' if source in [26,36] else it['node']];M=np.array(it['matrix']).reshape(4,4).T.copy();M[1,3]+=.32 if i<30 else -.48;pos=tx(M,m['p'].astype(float));face=m['f'] if np.linalg.det(M[:3,:3])>0 else m['f'][:,::-1];cache[i]=tree(pos,face)
        if str(i) in site['displayedMatrixColumnMajor']:assert np.allclose(M,np.array(site['displayedMatrixColumnMajor'][str(i)]).reshape(4,4).T,rtol=0,atol=1e-9)
        if i==36:p0=m['p'].copy();n0=m['n'].copy();f=face;M36=M;wp0=pos;heroHashes=m['hashes'];assert heroHashes==morph['sourceGeometrySha256'];assert sha(DENT/('hero-36'+suffix+'.glb'))==morph['sourceSha256'][lod]
    delta=np.zeros_like(p0);dn=np.zeros_like(n0);delta[rawIds]=np.asarray(morph['positionDelta'],dtype=np.float32).reshape(-1,3);dn[rawIds]=np.asarray(morph['normalDelta'],dtype=np.float32).reshape(-1,3);R=np.zeros((len(p0),4));R[rawIds]=region
    first,inv,wf,topo=compact_topology(p0,f);basefn=cross(wp0,f);baseLen=np.linalg.norm(basefn,axis=1);baseVol=vol(wp0*10,f);depth=np.linalg.norm(delta.astype(float)@M36[:3,:3].T,axis=1)*10;deep=int(np.argmax(depth));affected=depth>.005;rim=(R[f,0].mean(1)>.15);floor=(R[f,1].mean(1)>.55);body=affected[f].any(1);healthyTree=cache[36]['bv']
    rings=json.loads((OUT/'lesion-result.json').read_text())['footprintQA']['samples'];profile=[]
    for sample in rings:
        p=np.array(sample['positionCm']);co,_,fi,_=healthyTree.find_nearest(Vector(p));profile.append((fi,bary(np.asarray(co),wp0[f[fi]])))
    stages={};report['lods'][lod]={'assetHashes':{path.name:sha(path) for _,path in files},'healthySurfaceTopology':topo,'stages':stages};print('AUDIT',lod,'topo',topo,flush=True)
    for alpha in [0.,.25,.5,.75,1.]:
        p=p0+np.float32(alpha)*delta;wp=tx(M36,p.astype(float));n=unit(n0.astype(float)+alpha*dn.astype(float));wn=unit(n@np.linalg.inv(M36[:3,:3]));fn=cross(wp,f);fnLen=np.linalg.norm(fn,axis=1);newN=unit(fn);dots=(basefn*fn).sum(1)/(fnLen*baseLen);cache[36]=tree(wp,f);slots={};bad=[];pairs={'sameArch':0,'opposingArch':0}
        for a,b in itertools.combinations(sorted(cache),2):
            typ='sameArch' if (a<30)==(b<30) else 'opposingArch';pairs[typ]+=1;ii=inter(cache[a],cache[b]);
            if ii:bad.append({'fdi':[a,b],'kind':typ,'trianglePairs':len(ii),'firstPairs':[list(v) for v in ii[:3]]})
        orientation={'flippedFacesAgainstHealthy':int((dots<=0).sum()),'degenerateFacesBelow1eMinus12Mm2':int((fnLen*50<1e-12).sum()),'minimumAreaMm2':float(fnLen.min()*50),'minimumFaceAreaRatio':float((fnLen/baseLen).min()),'maximumGeometricNormalChangeDeg':float(np.degrees(np.arccos(np.clip(dots[body],-1,1))).max()),'minimumInterpolatedShadingVectorLengthBeforeNormalize':float(np.linalg.norm(n0.astype(float)+alpha*dn.astype(float),axis=1).min()),'maximumUVSeamPositionDifferenceMm':float(np.max(np.linalg.norm(wp-wp[first][inv],axis=1))*10),'signedVolumeMm3':vol(wp*10,f),'volumeChangeRelativeHealthyMm3':vol(wp*10,f)-baseVol,'maxDepthMeasuredFromCorrespondingHealthyVertexMm':float(np.linalg.norm(wp-wp0,axis=1).max()*10),'positionChangesOutsideSparseIds':int(np.sum(np.linalg.norm(p-p0,axis=1)[~np.isin(np.arange(len(p)),rawIds)]>0))}
        cc=wp[f].mean(1);visibility={};visbody={}
        for key,mask in [('allDisplacedSurfaceTriangles',body),('matureFloorRegion',floor),('chalkAndMarginRegion',rim)]:
            ids=np.flatnonzero(mask);rec=[]
            for k in ids:
                if k not in visbody:visbody[k]=visible(cc[k],newN[k],cam,cache)
                rec.append(visbody[k]);
            ok=np.asarray([v['visible'] for v in rec]);hidden={}
            for rr in rec:
                if not rr['visible']:
                    who=str(rr['closestOccludingFdi']) if rr['closestOccludingFdi'] else 'backfacing';hidden[who]=hidden.get(who,0)+1
            visibility[key]={'testedFaceCentroids':len(ids),'visibleFaceCentroids':int(ok.sum()),'visibleAreaFractionFromCentroidSamples':float(fnLen[ids][ok].sum()/fnLen[ids].sum()),'hiddenCentroidsByOccluder':hidden}
        prvis=[visible(w@wp[f[fi]],newN[fi],cam,cache) for fi,w in profile];visibility['prior41PointFootprintReboundToMorph']={'tested':len(prvis),'visible':sum(v['visible'] for v in prvis),'otherToothOccluded':sum(v['closestOccludingFdi'] not in [None,36] for v in prvis),'selfOccluded':sum(v['closestOccludingFdi']==36 for v in prvis)}
        fv=visible(wp[deep],wn[deep],cam,cache);adj=np.flatnonzero((f==deep).any(1));visibility['deepestCorrespondingFloorVertex']={'sourceVertexId':deep,'worldCm':wp[deep].tolist(),'depthMm':float(np.linalg.norm(wp[deep]-wp0[deep])*10),'surroundingFaceCentroids':len(adj),'visibleSurroundingFaceCentroids':sum(visible(cc[a],newN[a],cam,cache)['visible'] for a in adj),**fv}
        sc=selfcheck(wp[first],wf) if lod=='desktop' else report['lods']['desktop']['stages'][str(alpha)]['selfIntersection'];stages[str(alpha)]={'orientation':orientation,'selfIntersection':sc,'all28PairsTested':pairs,'interToothIntersections':bad,'macroVisibility':visibility};print(lod,alpha,'self',sc['nonadjacent_intersecting_triangle_pairs'],'flips',orientation['flippedFacesAgainstHealthy'],'inter',len(bad),'floor visible',fv['visible'],visibility['matureFloorRegion'],flush=True)
    if lod=='desktop':report['geometry']={'vertexCount':len(p0),'triangles':len(f),'sparseVertexIds':len(rawIds),'nonzeroDisplacedVertices':int((depth>1e-8).sum()),'displacedOver5Microns':int(affected.sum()),'verifiedHealthyGeometryHashes':heroHashes,'unchangedMeshIndicesAndUVs':True,'preserved46HealthyInstance':True}
report['immutableAssets']['eachComparedGlbAndManifestByteIdentical']=all(v['byteIdentical'] for v in report['immutableAssets']['deliveredMeshAndManifestComparisons'].values());allst=[s for lod in report['lods'].values() for s in lod['stages'].values()];mature=report['lods']['desktop']['stages']['1.0'];report['summary']={'sampledInfluences':[0,.25,.5,.75,1],'bothLodsSameFdi36AccessorHashes':True,'interToothPairTestsAcrossStagesAndLods':sum(sum(s['all28PairsTested'].values()) for s in allst),'interToothIntersectionPairsAcrossTests':sum(len(s['interToothIntersections']) for s in allst),'maxNonAdjacentSelfIntersectingPairsAtAnySample':max(s['selfIntersection']['nonadjacent_intersecting_triangle_pairs'] for s in allst),'maxFlippedFacesAtAnySample':max(s['orientation']['flippedFacesAgainstHealthy'] for s in allst),'maxDegenerateFacesAtAnySample':max(s['orientation']['degenerateFacesBelow1eMinus12Mm2'] for s in allst),'matureMaximumDepressionMm':mature['orientation']['maxDepthMeasuredFromCorrespondingHealthyVertexMm'],'matureRemovedVolumeMm3':-mature['orientation']['volumeChangeRelativeHealthyMm3'],'deepestFloorVertexVisibleAtEveryStageAndLod':all(s['macroVisibility']['deepestCorrespondingFloorVertex']['visible'] for s in allst),'matureFloorVisibility':mature['macroVisibility']['matureFloorRegion'],'matureBroaderChalkMarginVisibility':mature['macroVisibility']['chalkAndMarginRegion'],'mature41TrackedFootprintSamplesVisible':mature['macroVisibility']['prior41PointFootprintReboundToMorph']['visible'],'immutableGlbsAndManifestByteIdentical':report['immutableAssets']['eachComparedGlbAndManifestByteIdentical']};(OUT/'morph-geometry-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('DONE',OUT/'morph-geometry-audit.json',flush=True)
