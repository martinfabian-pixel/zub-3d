"""Read-only measurements on fixed, currently shipped FDI 36 distal / 37 mesial.
Run with Blender 4.5 LTS --background --factory-startup --python path-analysis.py.
Grid coordinates are in cm; measurements labeled mm use 10 mm per world cm.
"""
from pathlib import Path
import json,struct,hashlib,itertools
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parent;WORK=OUT.parents[3];PUB=OUT.parents[2]/'public/dentition-assets'
def unit(v):return v/np.linalg.norm(v)
def glb(path,node):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);buf=b[28+n:]
    def acc(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];o=v.get('byteOffset',0)+a.get('byteOffset',0);return np.ndarray((a['count'],w),dt,buf,o,(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
    nd=next(x for x in j['nodes'] if x.get('name')==node);assert not any(k in nd for k in ['matrix','translation','rotation','scale']);pr=j['meshes'][nd['mesh']]['primitives'][0];a=pr['attributes'];return acc(a['POSITION']),acc(a['NORMAL']),acc(a['TEXCOORD_0']),acc(pr['indices']).reshape(-1,3),hashlib.sha256(b).hexdigest()
def aslist(x):return np.asarray(x).tolist()
def tx(M,p):return np.asarray(p)@M[:3,:3].T+M[:3,3]
def initialize():
    m=json.loads((PUB/'manifest.json').read_text());teeth={x['fdi']:x for x in m['teeth']};geom={}
    for lod,suf in [('desktop',''),('mobile','-mobile')]:
        for i in [36,37]:
            item=teeth[i];name=('hero-36' if i==36 else 'dentition')+suf+'.glb';node='ToothExterior' if i==36 else 'FDI_37';p,n,uv,f,sha=glb(PUB/name,node);M=np.asarray(item['matrix']).reshape(4,4).T.copy();M[1,3]-=.48;wp=tx(M,p);wn=n@np.linalg.inv(M[:3,:3]);wn/=np.linalg.norm(wn,axis=1,keepdims=True);tree=BVHTree.FromPolygons(wp.tolist(),f.tolist(),all_triangles=True,epsilon=0);geom[lod,i]={'p':wp,'f':f,'uv':uv,'n':wn,'M':M,'inv':np.linalg.inv(M),'bvh':tree,'sha':sha,'name':name,'cej':tx(M,np.asarray(item['cervicalRing']))}
    return geom
def near(geo,pt):
    co,fn,face,d=geo['bvh'].find_nearest(Vector(pt));q=np.array(co);f=geo['f'][face];a,b,c=geo['p'][f];E=np.array([b-a,c-a]).T;w=np.linalg.lstsq(E,q-a,rcond=None)[0];bc=np.array([1-w.sum(),w[0],w[1]]);return {'p':q,'n':unit(bc@geo['n'][f]),'face':int(face),'local':tx(geo['inv'],q),'uv':bc@geo['uv'][f],'distance':float(d)}
def sample_record(s):return {'worldCm':aslist(s['p']),'normalWorld':aslist(s['n']),'localMetres':aslist(s['local']),'uv':aslist(s['uv']),'triangle':s['face']}
def closest_pair(A,B):
    seeds=[]
    for X,Y,reverse in [(A,B,False),(B,A,True)]:
        lo=Y['p'].min(0)-.05;hi=Y['p'].max(0)+.05;pp=X['p'][np.all((X['p']>lo)&(X['p']<hi),axis=1)]
        for p in pp:
            q,_,_,d=Y['bvh'].find_nearest(Vector(p));seeds.append((float(d),p.copy() if not reverse else np.array(q)))
    best=None
    for _,a in sorted(seeds,key=lambda t:t[0])[:36]:
        for k in range(100):
            b=np.array(B['bvh'].find_nearest(Vector(a))[0]);q=np.array(A['bvh'].find_nearest(Vector(b))[0]);step=np.linalg.norm(q-a);a=q
            if step<1e-8:break
        d=np.linalg.norm(a-b)
        if best is None or d<best[0]:best=(d,a,b)
    d,a,b=best;return {'gapMm':float(d*10),'36':sample_record(near(A,a)),'37':sample_record(near(B,b)),'midpointWorldCm':aslist((a+b)/2)}
G=initialize();pair={lod:closest_pair(G[lod,36],G[lod,37]) for lod in ['desktop','mobile']};O=np.array(pair['desktop']['midpointWorldCm']);mat=[G['desktop',i]['M'] for i in [36,37]];B=unit(sum(unit(m[:3,2]) for m in mat));D=unit(sum(unit(m[:3,0]) for m in mat));D=unit(D-B*(D@B));U=unit(np.cross(B,D));assert U[1]>.8 and B[0]>.7 and D[2]<-.7
report={'scope':'Exactly shipped fixed 36 / 37 outer tooth surfaces; no gum, papilla, bone, or brush geometry in these measurements. Source setup is an education illustration, not a measured individual or a clinical size recommendation. World cm = manifest.matrix after same-arch corrections, lower jaw y minus 0.48cm once; 10 mm/cm. No models or runtime modified.','assetSha256':{v['name']:v['sha'] for v in G.values()},'closestProximalPair':pair,'siteFocusWorldCm':aslist(O),'basisWorld':{'buccal':aslist(B),'lingual':aslist(-B),'36DistalToward37':aslist(D),'occlusal':aslist(U),'apical':aslist(-U)},'closestMethod':'Shortest candidate from opposing vertex-to-triangle queries followed by alternating closest-point projection from 36 best seeds. Geometry is separated by a small gap, so contact means closest proximal site; no actual touching.'}
(OUT/'path-preliminary.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('SITE',O,'B',B,'D',D,'UP',U,'gap mm',{k:v['gapMm'] for k,v in pair.items()},flush=True)

def uvq(s,v,q=0):return O+s*B+v*U+q*D
def facing_face(g,s,v,i):
    sign=1 if i==36 else -1;p=uvq(s,v,2.0*sign);q,n,face,dist=g['bvh'].ray_cast(Vector(p),Vector(-sign*D),4.0)
    return (np.array(q)-O)@D if q is not None else (-np.inf if i==36 else np.inf)
def possible_line(v):
    # Horizontal slice in anatomical B,D plane. Bound against actual nearest 36 distal / 37 mesial surface along D.
    s=np.linspace(-.85,.85,181);lo=np.array([facing_face(G['desktop',36],x,v,36) for x in s]);hi=np.array([min(facing_face(G[lod,37],x,v,37) for lod in ['desktop','mobile']) for x in s]);lohi=np.vstack([lo,hi]);
    candidates=[]
    for slope in np.linspace(-.50,.50,251):
        L=max(lo-slope*s);H=min(hi-slope*s);candidates.append((H-L,slope,(H+L)*.5))
    band,slope,origin=max(candidates,key=lambda x:x[0]);start=float(np.max(s[np.isfinite(lo)|np.isfinite(hi)])+.16);end=float(np.min(s[np.isfinite(lo)|np.isfinite(hi)])-.16)
    # Refine for Euclidean hard-surface clearance, not simply spacing along the D axis.
    def score(a,b):
        best=1000;neg=False
        for x in np.linspace(end,start,101):
            p=Vector(uvq(x,v,a+b*x))
            for geo in [G['desktop',36],G['desktop',37],G['mobile',37]]:
                co,n,i,d=geo['bvh'].find_nearest(p);d=float(d) if (p-co).dot(n)>-1e-6 else -float(d)
                best=min(best,d)
        return best
    ca=(score(origin,slope),origin,slope)
    for da,db in [(.008,.025),(.0025,.008),(.0008,.0025),(.0003,.0008)]:
        _,a0,b0=ca
        for a in [a0-da,a0,a0+da]:
            for b in [b0-db,b0,b0+db]:
                c=(score(a,b),a,b)
                if c[0]>ca[0]:ca=c
    best,a,b=ca;return {'v':v,'sStart':start,'sEnd':end,'q0':float(a),'qSlope':float(b),'minRadiusSampleMm':float(best*10),'cutBandMm':float(band*10)}

lines=[possible_line(v) for v in [-.05,-.08,-.10,-.12,-.14,-.16,-.18,-.20,-.23,-.26,-.29,-.32]]
report['candidateRigidStraightWires']=lines
print('CANDIDATE APEX OFFSETS / limiting radius mm',[(round(-r['v']*10,2),round(r['minRadiusSampleMm'],3),round(r['qSlope'],3)) for r in lines],flush=True)
(OUT/'path-candidates.json').write_text(json.dumps(report,indent=2),encoding='utf8')

wire=next(q for q in lines if abs(q['v']+.20)<1e-8);v=wire['v'];a=wire['q0'];m=wire['qSlope'];start=wire['sStart'];end=wire['sEnd'];S=uvq(start,v,a+m*start);E=uvq(end,v,a+m*end);axis=unit(E-S);length=np.linalg.norm(E-S)*10
def info_at(arc):
    wp=S+axis*arc/10;h={lod:{i:near(G[lod,i],wp) for i in [36,37]} for lod in ['desktop','mobile']};return wp,h
def cj_height(g,rec):
    # Approximate CEJ from the measured 16-point painted cervical ring in the manifest, interpolated by local azimuth.
    local=rec['local'];ring=tx(g['inv'],g['cej']);phi=np.arctan2(ring[:,2],ring[:,0]);order=np.argsort(phi);ph=np.r_[phi[order]-2*np.pi,phi[order],phi[order]+2*np.pi];rh=np.tile(ring[order,1],3);y=np.interp(np.arctan2(local[2],local[0]),ph,rh);return float((local[1]-y)*np.linalg.norm(g['M'][:3,1])*10)
def arc_ranges(aa,ok):
    nz=np.flatnonzero(ok)
    if len(nz)==0:return []
    runs=np.split(nz,np.where(np.diff(nz)>1)[0]+1);return [[float(aa[r[0]]),float(aa[r[-1]])] for r in runs]
aa=np.linspace(0,length,int(np.ceil(length/.009))+1);ds=float(aa[1]-aa[0]);radii=np.zeros((len(aa),2,2));signedMin=999.
for k,t in enumerate(aa):
    wp=Vector(S+axis*t/10)
    for L,lod in enumerate(['desktop','mobile']):
        for j,i in enumerate([36,37]):
            co,n,face,d=G[lod,i]['bvh'].find_nearest(wp);radii[k,L,j]=d*10;signedMin=min(signedMin,float((wp-co).dot(n))*10)
assert signedMin>0,'Wire centerline not strictly exterior on every sample.'
minr=float(radii.min());cert=minr-ds/2-.0003 # 1-Lipschitz + conservative numerical reserve in mm for float BVH
lim=np.unravel_index(np.argmin(radii),radii.shape);key_lod=['desktop','mobile'][lim[1]];key_id=[36,37][lim[2]]
regular=np.linspace(0,length,int(np.ceil(length/.13))+1);ps=[]
for t in regular:
    p,h=info_at(float(t));desktop={};compact={};sx=float((p-O)@B)
    for i in [36,37]:
        rec=h['desktop'][i];desktop[str(i)]={'nearestWorldCm':aslist(rec['p']),'normalWorld':aslist(rec['n']),'triangleNormalWorld':aslist(unit(G['desktop',i]['bvh'].find_nearest(Vector(p))[1])),'radialDirectionSurfaceToWire':aslist(unit(p-rec['p'])),'distanceMm':rec['distance']*10,'estimatedHeightAboveCejMm':cj_height(G['desktop',i],rec)}
        mrec=h['mobile'][i];compact[str(i)]={'nearestWorldCm':aslist(mrec['p']),'normalWorld':aslist(mrec['n']),'distanceMm':mrec['distance']*10}
    widths={}
    for lod in ['desktop','mobile']:
        lo=facing_face(G[lod,36],sx,v,36);hi=facing_face(G[lod,37],sx,v,37);widths[lod]=float((hi-lo)*10) if np.isfinite(lo) and np.isfinite(hi) else None
    ps.append({'arcMm':float(t),'worldCm':aslist(p),'desktop':desktop,'mobile':compact,'limitingRadiusBothLodsMm':min(q[i]['distance']*10 for q in h.values() for i in [36,37]),'distalAxisHardGapMm':widths})
bilateral=[]
for t in aa:
    sx=float(((S+axis*t/10)-O)@B);bilateral.append(all(np.isfinite(facing_face(G[lod,i],sx,v,i)) for lod in ['desktop','mobile'] for i in [36,37]))
bilateral=arc_ranges(aa,bilateral);bristle=.60;wireR=.09;contact={str(i):arc_ranges(aa,radii[:,:,j].min(axis=1)<=bristle) for j,i in enumerate([36,37])};contactAny=arc_ranges(aa,radii.min(axis=(1,2))<=bristle)
ferrule=[]
for dia in [1.2,1.5,1.6,1.8,2.0,2.4]:
    # First intrusion of a conservative sphere about the leading ferrule centre, along the actual insertion axis.
    # Respect a separate visual stop before the first opposed walls even if there is ample room at the edge.
    first=np.flatnonzero(radii.min(axis=(1,2))<dia/2+.08);first=float(aa[first[0]]) if len(first) else length;maxNose=min(first-ds-.05,bilateral[0][0]-.2)
    ferrule.append({'illustrativeDiameterMm':dia,'radialMarginMm':.08,'firstApproachThresholdArcMm':first,'maxNoseCenterArcMm':float(max(0,maxNose)),'maximumTipArcFor12mmExposedHeadMm':float(max(0,maxNose)+12),'minExposedLengthForTipToReachPathEndMm':float(length-max(0,maxNose))})
report['path']={'units':'World control points cm in the fixed displayed jaw, arc coordinates mm measured from buccal start toward lingual exit.','type':'Single rigid straight line, no stretching, piecewise bending or tooth movement.','apicalOffsetFromClosestSiteMm':-v*10,'unitInsertionDirectionWorld':aslist(axis),'controlPointsWorldCm':[aslist(S),aslist(E)],'centerAtClosestSiteBuccalCoordinateWorldCm':aslist(uvq(0,v,a)),'lengthMm':float(length),'buccalEntryArcMm':0,'lingualExitArcMm':float(length),'bilateralWallArcRangesMm':bilateral,'opposingSurfaceRayDefinition':'For each slice along buccal direction, ray independently through tooth36 from distal and37 from mesial; where both boundaries exist, measure difference along distal direction only. Oblique hard gap is not Euclidean wire clearance.','rigidEnvelope':{'minimumSampledRadiusMm':minr,'limitingArcMm':float(aa[lim[0]]),'limitingTooth':key_id,'limitingLod':key_lod,'denseStepMm':ds,'continuousLowerBoundRadiusMm':cert,'maximumDiameterSafeByThisBoundMm':2*cert,'minimumObservedDiameterMm':2*minr,'certificate':'Distance to a closed surface is 1-Lipschitz. All points on the straight segment lie within at most half one dense sample spacing, subtract that from sampled minimum plus 0.0003mm numerical reserve. This certifies a conservative swept capsule radius against BOTH hard-tooth mesh LODs. It is not a soft tissue safety certificate.','illustrativeWireDiameterMm':2*wireR,'wireRadialMarginLowerBoundMm':cert-wireR},'softBristleExample':{'freeRadiusMm':bristle,'freeOuterDiameterMm':2*bristle,'peakRadialDeflectionAgainstSimpleCapsuleMm':max(0,bristle-cert),'contactRangeMm':[contactAny[0][0],contactAny[-1][1]] if contactAny else [],'contactArcRangesMm':contactAny,'perToothReachArcRangesMm':contact,'meaning':'Only where a full-radius illustrative cylindrical bristle envelope can reach the hard surfaces. Deflect individual bristles against sampled local surfaces; taper and axial phase may reduce actual contact. A 1.2mm rigid tube does not fit this path. No universal/clinical brush size implied.'},'ferruleStops':ferrule,'ferruleRule':'Keep thick sleeve/ferrule nose (its foremost centerline station) at or buccal to maxNoseCenterArcMm for chosen component diameter; sleeve trails behind. Stops computed with 0.08mm radius allowance plus conservative first-bilateral-wall limit. Never scale the sleeve to thread through the corridor. Negative arc is permitted before entry.','samples':ps}
print('PATH',S,E,'length',length,'min radius',minr,'certified',cert,'bilateral',bilateral,'bristle contact',contact,'ferrule',ferrule[2],flush=True)
(OUT/'path-result.json').write_text(json.dumps(report,indent=2),encoding='utf8')
