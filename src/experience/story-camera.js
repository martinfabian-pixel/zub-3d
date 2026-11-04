import { Box3, Vector3 } from 'three';

/** The only conversion from the measured site to camera landmarks. All tooth
 * transforms remain authored; a target near the entry is not the arch centre.
 */
export function createStoryCameraConfig(site,base) {
  const settings=base.storyCamera;
  const lesion=new Vector3().fromArray(site.lesion.centerWorldCm);
  const buccal=new Vector3().fromArray(site.basisWorld.buccal);
  const occlusal=new Vector3().fromArray(site.basisWorld.occlusal);
  const detail=lesion.clone();
  const cleaning=lesion.clone().addScaledVector(buccal,settings.cleaningBuccalShiftMm/10).addScaledVector(occlusal,settings.cleaningOcclusalShiftMm/10);
  const bounds=(center,radius)=>new Box3(center.clone().addScalar(-radius),center.clone().addScalar(radius));
  const direction=site.lesion.macroCamera.directionFromLesionToCameraWorld;
  const specs=[
    ['hero',.045,'hero',base.camera.directions.hero],
    ['neighbors',.145,'neighbors',settings.neighborDirection],
    ['space',.22,'detail',direction,settings.detailDistanceCm],
    ['lesion',.48,'detail',direction,settings.detailDistanceCm],
    ['brush',.515,'cleaning',direction,settings.cleaningDistanceCm],
    ['withdrawn',.72,'cleaning',direction,settings.cleaningDistanceCm],
    ['result',.76,'detail',direction,settings.resultDistanceCm],
    ['result-hold',.80,'detail',direction,settings.resultDistanceCm],
    ['neighbors-return',.835,'neighbors',settings.neighborDirection],
    ['arch',.895,'arch',base.camera.directions.arch],
    ['full',.96,'full',base.camera.directions.full],
  ];
  return {
    landmarks:{detail:bounds(detail,settings.detailRadiusCm),cleaning:bounds(cleaning,settings.detailRadiusCm)},
    camera:{...base.camera,keyframes:specs.map(([key,at,landmark,direction,distance])=>({key,at,landmark,direction,distance}))},
  };
}
