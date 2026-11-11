import { createStageTypography, getStoryCopy } from './stage-typography.js';
import { getJourneyScrollMetrics } from './scroll.js';
import { STORY_TIMING } from './story-config.js';

/** Chapter navigation and screen-space type share the story sampler, never the camera. */
export function createInterface({config,section,stage,signal,navigate,navigationTarget=()=>null,explore,reset,zoom,finalView:chooseFinalView}) {
  const byId=id=>document.getElementById(id),steps=config.presentation.steps,help=byId('journey-help-dialog');
  const typography=createStageTypography(stage,document.querySelector('.journey-copy'));
  const nav=document.querySelector('.journey-steps'),buttons=[];
  const heroExplore=byId('journey-hero-explore'),freeExplore=byId('journey-explore');
  const closingButton=document.createElement('button');
  closingButton.className='outline-button journey-finale-continue';closingButton.type='button';
  closingButton.textContent='Zobraziť úsmev';closingButton.hidden=true;
  document.querySelector('.journey-copy').append(closingButton);
  closingButton.addEventListener('click',()=>navigate(1),{signal});
  const modelButtons=['journey-hero-explore','journey-explore','journey-reset','journey-zoom-in','journey-zoom-out'].map(byId);
  let index=-1,liveReady=false,smallLayout,lastPhase,lastNavIndex,lastCopy,lastResult,currentProgress=0;
  let lastExploreLabel;
  nav.replaceChildren();
  for(const [i,step] of steps.entries()) {
    const button=document.createElement('button');button.className='journey-step';button.type='button';button.dataset.progress=step.at;
    const label=document.createElement('span');label.className='sr-only';label.textContent=`${i+1}. ${step.label}`;
    button.title=step.label;button.append(label);nav.append(button);buttons.push(button);
    button.addEventListener('click',()=>navigate(step.at),{signal});
  }
  const move=delta=>{
    const target=navigationTarget();
    const requested=target==null?-1:steps.findIndex(step=>step.at===target);
    const current=requested<0?index:requested, last=steps.length-1;
    if(delta>0&&current===last){navigate(1);return;}
    if(delta<0&&(target===1||(index===last&&currentProgress>=STORY_TIMING.result[0]))){
      navigate(steps[last].at);return;
    }
    navigate(steps[Math.max(0,Math.min(last,current+delta))].at);
  };
  byId('journey-mobile-previous').addEventListener('click',()=>move(-1),{signal});
  byId('journey-mobile-next').addEventListener('click',()=>move(1),{signal});
  byId('journey-home').addEventListener('click',()=>navigate(0),{signal});
  byId('journey-show-all').addEventListener('click',()=>navigate(steps.find(step=>step.id==='dentition').at),{signal});
  byId('journey-view-smile').addEventListener('click',()=>chooseFinalView('smile'),{signal});
  byId('journey-view-anatomy').addEventListener('click',()=>chooseFinalView('anatomy'),{signal});
  heroExplore.addEventListener('click',explore,{signal});
  freeExplore.addEventListener('click',()=>{explore();if(freeExplore.hidden)heroExplore.focus({preventScroll:true});},{signal});
  byId('journey-reset').addEventListener('click',reset,{signal});
  byId('journey-zoom-in').addEventListener('click',()=>zoom(.88),{signal});
  byId('journey-zoom-out').addEventListener('click',()=>zoom(1/.88),{signal});
  byId('journey-help').addEventListener('click',()=>help.showModal(),{signal});
  byId('journey-notes').addEventListener('click',()=>{byId('journey-education').open=true;help.showModal();byId('journey-education').scrollIntoView({block:'nearest'});},{signal});
  const close=()=>help.close();
  byId('journey-close-help').addEventListener('click',close,{signal});byId('journey-help-done').addEventListener('click',close,{signal});
  help.addEventListener('click',event=>{if(event.target===help){const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}},{signal});
  function update({progress,ready,complete,exploring,atlasFocused=false,finalView,compact,state,reducedMotion=false}) {
    const small=window.matchMedia('(max-width:700px)').matches;
    // Delayed assets and reduced-motion states use the actually rendered chapter.
    const active=state?.chapterIndex??0;
    const step=steps[active],phase=state?.brushPose?.phase??'hidden',sceneProgress=state?.sceneProgress??0;
    currentProgress=sceneProgress;
    const copy=getStoryCopy(step,sceneProgress),changedChapter=index!==active;
    if(changedChapter||smallLayout!==small||lastCopy!==copy) {
      index=active;smallLayout=small;lastPhase=undefined;lastCopy=copy;
      const lines=copy.titleLines.map(text=>{
        const line=document.createElement('span');
        line.textContent=text;
        return line;
      });
      byId('journey-title').replaceChildren(...lines.flatMap((line,i)=>i?[' ',line]:[line]));
      byId('journey-step-number').textContent=`${String(index+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')}`;
      byId('journey-meta').textContent=step.meta;byId('journey-subject').textContent=step.subject;
      byId('journey-canvas').setAttribute('aria-label','3D výučbová scéna: '+copy.title+' Ťahaním otáčate. Šípky, + a − upravia pohľad.');
      buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      if(liveReady)byId('journey-stage-live').textContent='Kapitola '+(index+1)+' zo '+steps.length+'. '+copy.title;
      byId('journey-education-current').textContent=step.education??step.text;
    }
    // During a button journey, let a second press extend or reverse the
    // destination even before the displayed chapter has caught up.
    const target=navigationTarget(), requested=steps.findIndex(item=>item.at===target);
    const navIndex=requested<0?index:requested;
    const atEnd=target===1||(navIndex===steps.length-1&&sceneProgress>=STORY_TIMING.finalHold[0]);
    if(lastNavIndex!==navIndex||byId('journey-mobile-next').disabled!==atEnd){
      lastNavIndex=navIndex;
      byId('journey-mobile-previous').disabled=navIndex===0;
      byId('journey-mobile-next').disabled=atEnd;
    }
    if(lastPhase!==phase) {
      lastPhase=phase;
      const text=copy.text,note=step.id==='plaque'?step.note:'';
      let instruction='';
      if(step.id==='brush'&&!copy.phase) {
        const i=phase==='align'||phase==='hidden'?0:phase==='insert'?1:2;
        instruction=phase==='withdraw'?'Jemné vysunutie.':step.instructions[i];
      }
      byId('journey-description').textContent=text;
      byId('journey-note').textContent=note;byId('journey-note').hidden=!note;
      byId('journey-instruction').textContent=instruction;byId('journey-instruction').hidden=!instruction;
    }
    const result=step.id==='brush'&&sceneProgress>=STORY_TIMING.result[0]&&sceneProgress<STORY_TIMING.result[1];
    if(lastResult!==result){
      const labels=byId('journey-result-labels');labels.textContent=result?step.resultLabels.join('. '):'';
      labels.setAttribute('aria-hidden',String(!result));closingButton.hidden=!result;lastResult=result;
    }
    byId('journey-final-views').hidden=step.id!=='dentition'||sceneProgress<STORY_TIMING.atlas[0]||sceneProgress>STORY_TIMING.atlas[1];
    typography.update(step,state?.progress??progress,{mobile:small,reducedMotion,free:exploring,sceneProgress});
    const isHero=step.id==='hero';
    heroExplore.hidden=!isHero||exploring;
    freeExplore.hidden=isHero&&!exploring;
    liveReady=ready;
    for(const button of modelButtons)button.disabled=!ready;
    for(const name of ['smile','anatomy']){
      const button=byId('journey-view-'+name);button.disabled=!ready||!complete;button.setAttribute('aria-pressed',String(finalView===name));
    }
    const exploreLabel=exploring?(atlasFocused?'Ukončiť voľné 3D':'Pokračovať v príbehu'):'Voľné 3D';
    if(lastExploreLabel!==exploreLabel){
      lastExploreLabel=exploreLabel;
      freeExplore.setAttribute('aria-pressed',String(exploring));
      freeExplore.textContent=exploreLabel;
      freeExplore.classList.toggle('is-free',exploring);
    }
    byId('journey-orbit-hint').textContent=exploring?'Voľné 3D · otáčajte v oboch osiach · pinch alebo koliesko približuje':compact?'Ťah do strán otáča · zvislo pokračujete v príbehu':'Ťahaním otáčate · kolieskom pokračujete v príbehu';
  }
  function scrollTo(progress,reducedMotion) {
    const {base,travel}=getJourneyScrollMetrics(section,stage);
    window.scrollTo({top:base+progress*Math.max(0,travel),behavior:reducedMotion?'instant':'smooth'});
  }
  return {update,scrollTo,report:()=>typography.report(),get index(){return index;},dispose(){closingButton.remove();if(help.open)help.close();}};
}
