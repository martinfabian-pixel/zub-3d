"""Generate sparse educational lesion morph and contact-conforming plaque data.

Inputs: frozen 36/37 GLBs, fixed manifest and captured dual-LOD mesh surveys.
Only new public/story-assets outputs are written. No source or runtime edits.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import trimesh
import prepare_dentition as dent

ROOT=dent.ROOT;SRC=ROOT/'assets/source/proximal-story';OUT=ROOT/'public/story-assets'
def rnd(x,d=8):return np.round(np.asarray(x,dtype=float),d).tolist()
def flat(x,d=8):return rnd(np.asarray(x).ravel(),d)
def emit(name,doc):
    OUT.mkdir(parents=True,exist_ok=True);(OUT/name).write_text(json.dumps(doc,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf8')
def record(x):return json.loads((SRC/x).read_text(encoding='utf8'))
def model(i,lod,manifest):
    suffix='' if lod=='desktop' else '-mobile';filename=('hero-36' if i==36 else 'dentition')+suffix+'.glb';path=dent.OUT/filename;j,b=dent.glb(path);name='ToothExterior' if i==36 else 'FDI_37';pr=next(v for v in j['meshes'] if v['name']==name)['primitives'][0];at=pr['attributes'];p=dent.accessor(j,b,at['POSITION']).astype(float);n=dent.accessor(j,b,at['NORMAL']).astype(float);uv=dent.accessor(j,b,at['TEXCOORD_0']).astype(float);f=dent.accessor(j,b,pr['indices']).reshape(-1,3).astype(int)
    t=next(v for v in manifest['teeth'] if v['fdi']==i);M=np.asarray(t['matrix']).reshape(4,4).T.copy();M[1,3]-=.48
    return {'p':p,'n':n,'uv':uv,'f':f,'worldMm':dent.affect(M,p)*10,'worldN':dent.norm(n@np.linalg.inv(M[:3,:3])),'M':M,'sha':hashlib.sha256(path.read_bytes()).hexdigest(),'ring':np.asarray(t['cervicalRing'])}

def smooth_field(p,f):
    _,weld=np.unique(np.round(p,12),axis=0,return_inverse=True);tri=p[f];cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);face=dent.norm(cross);N=np.zeros((weld.max()+1,3))
    for k in range(3):
        a=tri[:,(k+1)%3]-tri[:,k];b=tri[:,(k+2)%3]-tri[:,k];angle=np.arctan2(np.linalg.norm(np.cross(a,b),axis=1),np.sum(a*b,axis=1));np.add.at(N,weld[f[:,k]],face*angle[:,None])
    return dent.norm(N)[weld]

def lesion_morph(g,site):
    p,n,w,wn,f=g['p'],g['n'],g['worldMm'],g['worldN'],g['f'];M=g['M'];c=np.array(site['anchor36']['worldCm'])*10;frame=site['basisWorld'];u=np.asarray(frame['buccalLingualTangentBuccalPositive']);v=np.asarray(frame['occlusalGingivalTangentOcclusalPositive']);out=np.asarray(frame['outwardNormal']);r=w-c;x=r@u;y=r@v;z=r@out
    # A bounded asymmetric, non-circular opening. This is authored illustration,
    # not a scan finding, a disease rate or a simulation of tissue chemistry.
    a=-.20;xx=x*np.cos(a)+y*np.sin(a);yy=-x*np.sin(a)+y*np.cos(a);U=(xx-.055*np.sin(yy*4.1))/.82;V=(yy+.07*xx-.029*np.sin(xx*4.6))/.57;theta=np.arctan2(V,U)
    scale=1+.087*np.sin(3*theta+.42)+.047*np.cos(5*theta-.52)+.021*np.sin(7*theta+1.08);rr=np.sqrt(U*U+V*V)/scale
    allowed=(abs(z)<.6)&((wn@out)>.60);body=(1-dent.smooth(.21,1.0,rr))*allowed
    # A gently asymmetric floor, curved side walls, thin irregular margin.
    depth=.645*body*np.clip(.97+.033*np.sin(4.3*xx+1.7*yy)+.023*np.sin(4.2*yy-xx),.9,1.04)
    # A single geometric displacement field is shared across every UV duplicate.
    _,first,inv=np.unique(np.round(p,12),axis=0,return_index=True,return_inverse=True);avg=np.zeros((len(first),3));np.add.at(avg,inv,wn);safe_normal=dent.norm(avg)[inv];depw=-safe_normal*depth[first][inv,None];delta=(depw/10)@np.linalg.inv(M[:3,:3]).T;end=p+delta
    bn=smooth_field(p,f);en=smooth_field(end,f);axis=np.cross(bn,en);cos=np.sum(bn*en,axis=1);rotated=n+np.cross(axis,n)+np.cross(axis,np.cross(axis,n))/np.maximum(1+cos[:,None],1e-9);newN=dent.norm(rotated);normal_delta=newN-n;normal_delta[np.linalg.norm(axis,axis=1)<1e-10]=0
    chalk=(1-dent.smooth(.84,1.63,rr))*allowed;floor=(1-dent.smooth(.34,.90,rr))*allowed;rim=dent.smooth(.35,.70,rr)*(1-dent.smooth(.79,1.13,rr))*allowed;variation=np.clip(.54+.22*np.sin(xx*7.4+yy*4.1)+.10*np.cos(xx*4.1-yy*6.7),0,1)*chalk
    regions=np.stack([chalk,floor,rim,variation],axis=1);ids=np.flatnonzero((np.linalg.norm(delta,axis=1)>1e-12)|(np.linalg.norm(normal_delta,axis=1)>1e-7)|(chalk>1e-6));affected=np.flatnonzero(depth>.005)
    cross=lambda q:np.cross(q[f[:,1]]-q[f[:,0]],q[f[:,2]]-q[f[:,0]])
    base=cross(p);final=cross(end);flips=int((np.einsum('ij,ij->i',base,final)<=0).sum());mesh=trimesh.Trimesh(end*1000,f,process=True);assert flips==0 and mesh.is_watertight and mesh.is_winding_consistent and len(mesh.split())==1 and np.all(mesh.area_faces>1e-12)
    source_vol=trimesh.Trimesh(w,f,process=False).volume;end_vol=trimesh.Trimesh(dent.affect(M,end)*10,f,process=False).volume;assert source_vol>end_vol>0
    audit={'sourceVertexCount':len(p),'sourceTriangleCount':len(f),'sparseVertexCount':len(ids),'displacedVertexCount':len(np.flatnonzero(depth>1e-6)),'maximumMeasuredDepressionMm':float(depth.max()),'displacedFootprintExtentMmAt5Microns':[float(np.ptp(x[affected])),float(np.ptp(y[affected]))],'healthySignedVolumeNominalMm3':float(source_vol),'matureSignedVolumeNominalMm3':float(end_vol),'illustrativeTissueVolumeRemovedMm3':float(source_vol-end_vol),'flippedFaces':flips,'watertightAfterUvWeld':bool(mesh.is_watertight),'consistentWinding':bool(mesh.is_winding_consistent),'degenerateFaces':int(np.sum(mesh.area_faces<1e-12)),'components':len(mesh.split()),'outsidePatchPositionChangeMetres':0,'outsideOneRingNormalChange':0,'topologyAndUvsUnchanged':True}
    result={'schemaVersion':1,'fdi':36,'vertexCount':len(p),'triangleCount':len(f),'sourceSha256':{'desktop':g['sha'],'mobile':dent.sha((dent.OUT/'hero-36-mobile.glb').read_bytes())},'indices':ids.tolist(),'positionDelta':flat(delta[ids],11),'normalDelta':flat(normal_delta[ids],8),'region':flat(regions[ids],5),'units':'Sparse arrays correspond to original 36 vertex indices; local POSITION deltas in metres and relative NORMAL deltas. Fill every other entry with zero. Clone only mesh36 and use morphTargetsRelative=true; never modify shared mesh46.','regionChannels':['R: noncavitated chalky/rough enamel footprint','G: mature exposed floor weight','B: broken cavity margin weight','A: restrained authored tone breakup, multiplied by the lesion footprint'],'healthyInfluence':0,'noncavitatedEarlyInfluence':0,'matureInfluence':1,'audit':audit,'attribution':'Mandibular First Molar, University of Dundee School of Dentistry, CC BY 4.0. Hypothetical geometric cavity and region weights authored for ZUB-3D. No original disease label or measured patient lesion.'}
    result['sourceGeometrySha256']=json.loads((dent.OUT/'hero-36-provenance.json').read_text())['outputs']['hero-36.glb']['geometry_sha256']
    exclusion=np.maximum(dent.smooth(.002,.038,depth),1-dent.smooth(.78,1.09,rr))*allowed
    return result,exclusion,end,newN,regions

def patch(g,fdi,origin,axis,L,reference,exclusion=None):
    p,n,uv,f,w,N=g['p'],g['n'],g['uv'],g['f'],g['worldMm'],g['worldN'];project=np.clip((w-origin)@axis,0,L);radial=w-(origin+project[:,None]*axis);distance=np.linalg.norm(radial,axis=1);occl=np.array(reference['basisWorld']['occlusal']);distal=np.array(reference['basisWorld']['36DistalToward37']);toward=distal if fdi==36 else -distal
    sc=7.05 if fdi==36 else 6.38;U=(project-sc)/(2.95 if fdi==36 else 2.70);V=(radial@occl-.12-.085*np.sin(3*U))/.96;theta=np.arctan2(V,U);rr=np.sqrt(U*U+V*V)/(1+.095*np.sin(3*theta+.47)+.044*np.cos(5*theta-.58))
    facing=N@toward;eligible=(distance<1.65)&(facing>.46);weight=(1-dent.smooth(.70,1.06,rr))*eligible
    keep=f[np.max(weight[f],axis=1)>.0001];ids,fi=np.unique(keep,return_inverse=True);faces=fi.reshape(-1,3);assert len(ids)>15 and len(faces)>14
    q={'fdi':fdi,'positions':flat(p[ids],10),'normals':flat(n[ids],7),'uv':flat(uv[ids],7),'indices':faces.ravel().tolist(),'sourceVertexIndices':ids.tolist(),'pathDistanceMm':flat(distance[ids],5),'nearestArcMm':flat(project[ids],5),'edgeWeight':flat(weight[ids],5),'lesionExclusion':flat(np.zeros(len(ids)) if exclusion is None else exclusion[ids],5)}
    m=weight[ids]>.05;q['audit']={'vertices':len(ids),'triangles':len(faces),'positiveWeightVertices':int(m.sum()),'withinFreeBristleEnvelope':int(np.sum(m&(distance[ids]<=.60))),'outsideFreeBristleEnvelope':int(np.sum(m&(distance[ids]>.60))),'positiveWeightDistanceRangeMm':rnd([distance[ids][m].min(),distance[ids][m].max()],5),'maximumPlaqueOffsetMmSuggested':.04};assert q['audit']['withinFreeBristleEnvelope']>0 and q['audit']['outsideFreeBristleEnvelope']>0
    return q

def main():
    wire=record('path-result.json');lesion=record('lesion-result.json');manifest=json.loads((dent.OUT/'manifest.json').read_text());hard_sha=wire['assetSha256'];assert all(dent.sha((dent.OUT/file).read_bytes())==value for file,value in hard_sha.items());g=model(36,'desktop',manifest);mg=model(36,'mobile',manifest);assert np.array_equal(g['p'],mg['p']) and np.array_equal(g['f'],mg['f'])
    shape,ex,end,normals,regions=lesion_morph(g,lesion);emit('caries-36.json',shape);path=wire['path'];A,B=np.asarray(path['controlPointsWorldCm'])*10;ax=dent.norm(B-A);length=float(np.linalg.norm(B-A));samples=[]
    for t in path['samples']:
        def contacts(lod):return [{'fdi':i,'nearestWorld':rnd(t[lod][str(i)]['nearestWorldCm']),'normalWorld':rnd(t[lod][str(i)]['normalWorld'],7),'distanceMm':round(t[lod][str(i)]['distanceMm'],6)} for i in [36,37]]
        samples.append({'position':rnd(t['worldCm']),'arcLengthMm':round(t['arcMm'],6),'clearanceMm':round(t['limitingRadiusBothLodsMm'],6),'contacts':contacts('desktop'),'contactsMobile':contacts('mobile')})
    dims={'wireRadius':.09,'wireDiameter':.18,'bristleRadius':.60,'bristleDiameter':1.20,'bristledLength':8.0,'bareTipLength':.45,'exposedHeadLength':13.1,'ferruleRadius':.8,'ferruleDiameter':1.6,'handleRadius':1.85,'handleDiameter':3.7};ferrule=next(t for t in path['ferruleStops'] if t['illustrativeDiameterMm']==1.6)
    brush={'centerline':samples,'dimensionsMm':dims,'controlPointsWorldCm':path['controlPointsWorldCm'],'entryTangent':path['unitInsertionDirectionWorld'],'insertionDirectionWorld':path['unitInsertionDirectionWorld'],'lengthMm':length,'maxCurvaturePerMm':0,'contactRangeMm':path['softBristleExample']['contactRangeMm'],'contactRangesByFdiMm':path['softBristleExample']['perToothReachArcRangesMm'],'bilateralWallArcRangesMm':path['bilateralWallArcRangesMm'],'tipRangeMm':[0,length],'maxTipArcMm':length,'maxFerruleNoseArcMm':ferrule['maxNoseCenterArcMm'],'rigidEnvelope':path['rigidEnvelope'],'bristleNote':path['softBristleExample']['meaning'],'maximumIllustrativeBristleDeflectionMm':path['softBristleExample']['peakRadialDeflectionAgainstSimpleCapsuleMm'],'ferruleNote':path['ferruleRule']}
    patches=[patch(g,36,A,ax,length,wire,ex),patch(model(37,'desktop',manifest),37,A,ax,length,wire)];mobile37=patch(model(37,'mobile',manifest),37,A,ax,length,wire)
    M=g['M'];bw=lesion['basisWorld'];local={k:rnd(dent.norm(np.linalg.solve(M[:3,:3],v)),8) for k,v in bw.items()};anchor=lesion['anchor36'];site={'schemaVersion':1,'units':'World cm including fixed lower Y−0.48cm. Distances/radii/arc lengths in nominal mm, local patch coordinates/metre morph deltas in original glTF metres. Never apply lower opening twice.','teeth':[36,37],'assetSha256':hard_sha,'displayedMatrixColumnMajor':{str(i):rnd(model(i,'desktop',manifest)['M'].T.ravel(),10) for i in [36,37]},'basisWorld':wire['basisWorld'],'closestProximalPair':wire['closestProximalPair'],'tightestGapFocusWorldCm':wire['siteFocusWorldCm'],'focusWorldCm':path['centerAtClosestSiteBuccalCoordinateWorldCm'],'brush':brush,'plaque':{'patches':patches,'mobile37':mobile37,'contract':'In compact mode replace only the FDI37 patch with mobile37. Positions lie on actual source meshes; UV, normal and indexed faces are native. Tunable render lift 0.02–0.04 mm. edgeWeight gives soft irregular perimeter. Subtract mature lesionExclusion only as cavitation develops. nearestArcMm/pathDistanceMm are exact closest points to finite calibrated path, not a cleaning percentage. Use instantaneous bristle position/radius to reduce ONLY supported, contacted plaque.'},'lesion':{'fdi':36,'asset':'caries-36.json','anchor':anchor,'centerWorldCm':anchor['worldCm'],'centerLocalMetres':anchor['localMetres'],'normalWorld':anchor['normalWorld'],'basisWorld':bw,'basisLocal':local,'macroCamera':lesion['macroCamera'],'footprintVisibilityAudit':{k:v for k,v in lesion['footprintQA'].items() if k!='samples'},'distanceToOpposing37Mm':lesion['distanceToOpposing37Mm'],'heightAboveEstimatedCejMm':lesion['estimatedCrownwardHeightAboveLocalPaintedCejMm'],'buccalOffsetFromTightestMm':lesion['buccalDistanceFromClosestSiteMm'],'apicalOffsetFromTightestMm':lesion['apicalDistanceFromClosestSiteMm'],'wireRelationship':lesion['wireRelationship'],'morphAudit':shape['audit']},'limitations':['Educational hard-surface measurements in an illustrative 21mm reference scale. No gingiva, papilla or bone in this geometry.','No clinical brush size, passage safety, treatment advice or disease timeline can be inferred.','Thickness, plaque, early chalking and mature cavity are authored examples, not conditions in the original Dundee specimen. Brushing does not restore lost tooth structure.']}
    camera=site['lesion']['macroCamera'];camera.update(direction=camera['directionFromLesionToCameraWorld'],target=camera['lookAtWorldCm'],distanceCm=camera['cameraDistanceMmUsedForFootprintCheck']/10)
    site['plaque']['verifiedReachableCenters']=lesion.get('brushReachablePlaqueAnchors',{})
    site['sourceLicense']={'author':'University of Dundee, School of Dentistry','license':'CC-BY-4.0','creditFile':'credits.txt'}
    emit('site.json',site)
    print(json.dumps({'morph':shape['audit'],'patches':[p['audit'] for p in [*patches,mobile37]],'siteBytes':(OUT/'site.json').stat().st_size,'morphBytes':(OUT/'caries-36.json').stat().st_size},indent=2))

if __name__=='__main__':main()
