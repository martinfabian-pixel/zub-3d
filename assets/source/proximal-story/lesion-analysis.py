"""Find an actual, exposed distal FDI36 enamel patch above the wire route with FDI37 present.
Reads existing geometric audit helpers; outputs only lesion-result.json beside this script.
"""
import importlib.util,json,itertools
from pathlib import Path
import numpy as np
from mathutils import Vector
OUT=Path(__file__).resolve().parent
# Import the common read-only GLB/BVH functions without rerunning or altering the finalized wire report.
helpers={ '__file__':str(OUT/'path-analysis.py') };exec(compile((OUT/'path-analysis.py').read_text().split('\nG=initialize();')[0],'path-geometry','exec'),helpers)
unit=helpers['unit'];near=helpers['near'];tx=helpers['tx'];record=helpers['sample_record'];G=helpers['initialize']();wire=json.loads((OUT/'path-result.json').read_text());O=np.array(wire['siteFocusWorldCm']);B=np.array(wire['basisWorld']['buccal']);U=np.array(wire['basisWorld']['occlusal']);D=np.array(wire['basisWorld']['36DistalToward37'])
A=G['desktop',36];TREE=A['bvh'];views=[(float(q),float(u),unit(B+u*U+q*D)) for q in np.linspace(-.36,.60,25) for u in np.linspace(.2,1.55,19)];EPS=.00012 # 1.2 micrometres in world cm
def visible(s,dir,full=False):
    p=Vector(s['p']+s['n']*EPS);d=Vector(dir);out={}
    for lod,i in [('desktop',36),('desktop',37),('mobile',37)]:
        hit=G[lod,i]['bvh'].ray_cast(p,d,10)[0]
        if hit is not None:
            if not full:return False
            out[f'{lod}-{i}']=float(np.linalg.norm(np.array(hit)-np.array(p))*10)
    return out if full else True
def make_patch(s,w=.060,h=.040):
    n=s['n'];tv=unit(U-n*(n@U));tb=unit(np.cross(tv,n));tb=tb if tb@B>0 else -tb
    points=[]
    for r,count in [(0,1),(.45,8),(.78,12),(1,20)]:
        for a in np.arange(count)*2*np.pi/count:
            p=s['p']+tb*(w*r*np.cos(a))+tv*(h*r*np.sin(a));points.append(near(A,p))
    return tb,tv,points
def surface_at(b,v):
    co,n,fac,d=TREE.ray_cast(Vector(O+b*B+v*U+D*2),Vector(-D),4.);return near(A,np.array(co)) if co is not None else None
def cej(g,s):
    rr=tx(g['inv'],g['cej']);theta=np.arctan2(rr[:,2],rr[:,0]);ind=np.argsort(theta);angles=theta[ind];y=rr[ind,1];ph=np.arctan2(s['local'][2],s['local'][0]);at=np.interp(ph,np.r_[angles-2*np.pi,angles,angles+2*np.pi],np.tile(y,3));return float((s['local'][1]-at)*np.linalg.norm(g['M'][:3,1])*10)
candidates=[]
for b in np.linspace(.10,.20,11):
    for v in np.linspace(-.105,-.185,9):
        s=surface_at(b,v)
        if s is None or s['n']@D<.55:continue
        dirs=[]
        for q,u,d in views:
            dot=float(s['n']@d)
            if dot<.15 or not visible(s,d):continue
            # Primary: visible projected area. Secondary: keep a buccal/mildly occlusal, not steep top-down, macro.
            score=dot-.07*abs(u-.58)-.025*abs(q-.16)
            dirs.append((score,q,u,dot,d))
        if dirs:
            dirs=sorted(dirs,key=lambda x:-x[0]);z=dirs[0];candidates.append((z[0]-.025*abs(b-.16)/.04-.02*abs(v+.14)/.04,b,v,s,dirs[:35]))
assert candidates,'No genuinely visible distal candidate in constrained buccal/apical window.'
candidates.sort(key=lambda i:-i[0]);test=[]
for _,b,v,s,dirs in candidates[:24]:
    tb,tv,points=make_patch(s);best=None
    for _,q,u,dot,d in dirs:
        good=[visible(r,d) and r['n']@d>.07 for r in points];fraction=sum(good)/len(points);cosmin=min(r['n']@d for r,g in zip(points,good) if g);score=fraction*1.5+dot*.75+cosmin*.22-.075*abs(u-.55)-.03*abs(q-.18)-.018*abs(b-.16)/.04-.012*abs(v+.14)/.04
        if best is None or score>best[0]:best=(score,b,v,s,q,u,d,dot,fraction,cosmin,tb,tv,points)
    test.append(best)
score,b,v,s,q,u,cam,dot,fraction,cosmin,tb,tv,patch=max(test,key=lambda z:z[0]);print('ANCHOR',s['p'],'local',s['local'],'N',s['n'],'CAM',cam,'normal dot D,C',s['n']@D,dot,'patch fraction',fraction,'cm apical/buccal v,b=',v,b,'closest opposite tooth',near(G['desktop',37],s['p'])['distance']*10,flush=True)
CamCm=3.1;cameraPos=s['p']+cam*CamCm;projected=[]
for r in patch:
    d=unit(cameraPos-r['p']);projected.append({'offsetBLMm':float((r['p']-s['p'])@tb*10),'offsetOcclusalMm':float((r['p']-s['p'])@tv*10),'positionCm':r['p'].tolist(),'localMetres':r['local'].tolist(),'normalWorld':r['n'].tolist(),'normalDotPerspectiveRay':float(r['n']@d),'perspectiveOccluders':visible(r,d,True),'visible':bool(not visible(r,d,True) and r['n']@d>.07)})
opp={lod:record(near(G[lod,37],s['p'])) for lod in ['desktop','mobile']};dist=near(G['desktop',37],s['p'])['distance']*10
out={'source':'Actual shipped canonical FDI36 exterior in manifest.matrix + displayed lower jaw y -0.48cm; FDI37 present LOD-specific. No tooth geometry changed. Hypothetical lesion site, not a scan finding.','anchor36':record(s),'basisWorld':{'buccalLingualTangentBuccalPositive':tb.tolist(),'occlusalGingivalTangentOcclusalPositive':tv.tolist(),'outwardNormal':s['n'].tolist()},'buccalDistanceFromClosestSiteMm':float(b*10),'apicalDistanceFromClosestSiteMm':float(-v*10),'heightCoronalToWirePlaneMm':float((v+.2)*10),'estimatedCrownwardHeightAboveLocalPaintedCejMm':cej(A,s),'outwardNormalDotDistal':float(s['n']@D),'nearestOpposing37':opp,'distanceToOpposing37Mm':dist,'macroCamera':{'lookAtWorldCm':s['p'].tolist(),'directionFromLesionToCameraWorld':cam.tolist(),'cameraWorldCmAt31mm':cameraPos.tolist(),'directionBasisCoefficientsBeforeNormalize':{'buccal':1,'occlusal':u,'distal':q},'anchorNormalDotCameraRay':dot,'cameraDistanceMmUsedForFootprintCheck':CamCm*10},'footprintQA':{'widthBLMm':1.2,'heightOcclusalMm':.8,'points':len(patch),'orthographicAllSurfacesUnobstructedFraction':fraction,'perspectiveVisibleFraction':sum(x['visible'] for x in projected)/len(patch),'lowestPositiveNormalDotOrthographicView':float(cosmin),'method':'41 points sampled on three concentric rings plus center; each projected back to true FDI36 mesh surface. Ray from surface +1.2µm normal, test 36 and both 37 LOD meshes. Perspective camera 31mm from anchor. Test tooth surfaces only; gingiva, microscope, brush and other staging occluders are not included.','samples':projected},'wireRelationship':'Anchor deliberately coronal and buccal to the 2 mm-apical centerline, on the proximal (distal) enamel of FDI36. Shared-frame positions allow independent lesion indentation and wire interaction without moving teeth.'}
ws,we=np.asarray(wire['path']['controlPointsWorldCm']);wdir=unit(we-ws);wlength=np.linalg.norm(we-ws)
def line_distance(p):
    t=np.clip((p-ws)@wdir,0,wlength);return float(np.linalg.norm(p-ws-wdir*t)*10),float(t*10)
out['anchorWireRadialDistanceMm'],out['anchorNearestWireArcMm']=line_distance(s['p'])
plaque={}
for i in [36,37]:
    side=1 if i==36 else -1;g=G['desktop',i];tested=[]
    for row in wire['path']['samples']:
        x=row['desktop'][str(i)];r=near(g,np.array(x['nearestWorldCm']));rd,arc=line_distance(r['p']);distalFacing=side*float(r['n']@D)
        if not (.43<rd<.565 and distalFacing>.54) or (r['p']-O)@B<0:continue
        directions=[cam] if i==36 else [unit(B+up*U+q*D) for up in [.18,.36,.6,.9] for q in [-.9,-.65,-.45,-.3,-.15,0,.15,.3]]
        for view in directions:
            # Test the complete mouth-side pair, both LODs, starting just outside the actual selected surface.
            pt=Vector(r['p']+r['n']*EPS);occluded=any(G[lod,k]['bvh'].ray_cast(pt,Vector(view),10.)[0] is not None for lod,k in [('desktop',36),('desktop',37),('mobile',37)] if not(i==37 and k==37 and lod=='mobile'))
            if occluded or r['n']@view<.12:continue
            score=float(r['n']@view)-.015*abs(arc-6.3)-1.9*(rd-.49)**2
            tested.append((score,r,rd,arc,distalFacing,view))
    if tested:
        options=[]
        for score,r,rd,arc,df,view in sorted(tested,key=lambda x:-x[0]):
            normals=unit(U-r['n']*(r['n']@U));tip=unit(np.cross(normals,r['n']));tip*=np.sign(tip@B)
            for size in [1.,.80,.60]:
                shape=[]
                for angle in np.arange(16)*np.pi/8:
                    q=near(g,r['p']+size*(tip*.035*np.cos(angle)+normals*.021*np.sin(angle)));rr,al=line_distance(q['p']);shape.append({'worldCm':q['p'].tolist(),'localMetres':q['local'].tolist(),'distanceToWireMm':rr,'arcMm':al})
                worst=max(z['distanceToWireMm'] for z in shape)
                if worst<=.594:
                    options.append((score+.15*size,r,rd,arc,df,view,tip,normals,size,shape,worst));break
        if options:
            _,r,rd,arc,df,view,tip,normals,size,shape,worst=max(options,key=lambda x:x[0]);gm=G['mobile',i];mobileRec=near(gm,r['p']);rm,am=line_distance(mobileRec['p']);plaque[str(i)]={**record(r),'radialDistanceToWireMm':rd,'nearestArcMm':arc,'proximalFacingDot':df,'tangentBuccalWorld':tip.tolist(),'tangentOcclusalWorld':normals.tolist(),'lookDirectionTowardCameraWorld':view.tolist(),'patchWidthHeightMm':[.70*size,.42*size],'patchBoundary':shape,'maxBoundaryWireDistanceMm':worst,'mobileCorrespondence':{**record(mobileRec),'distanceToWireMm':rm,'nearestArcMm':am},'bristleReachNote':'All 16 sampled patch boundary points within 0.594mm of centerline for a free bristle radius 0.60mm. Only animate removal where an actual bristle envelope sweeps this surface (including axial head motion). Never erase a cavitated lesion.'}
out['brushReachablePlaqueAnchors']=plaque;out['anchorRelationshipToCleaning']='The illustrative lesion center is coronal to the passage. Reported centerline distance can exceed free bristle radius: keep removal on physically reachable plaque and demonstrate cavity on the coronal adjacent enamel; do not animate a brush healing a cavity.'
(OUT/'lesion-result.json').write_text(json.dumps(out,indent=2),encoding='utf8');print('Finite-camera visibility',out['footprintQA']['perspectiveVisibleFraction'],'CEJ height',out['estimatedCrownwardHeightAboveLocalPaintedCejMm'],'wire distance lesion',out['anchorWireRadialDistanceMm'],'plaque anchors',[(i,x['radialDistanceToWireMm'],x['maxBoundaryWireDistanceMm']) for i,x in plaque.items()],flush=True)
